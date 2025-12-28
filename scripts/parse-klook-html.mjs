#!/usr/bin/env node

/**
 * Klook HTML Parser
 *
 * Extracts paid activities from Klook HTML pages (saved offline).
 * Parses JSON-LD structured data and correlates with pricing from HTML.
 *
 * Usage: node scripts/parse-klook-html.mjs <html-file> <output-file> [city]
 *
 * Example:
 *   node scripts/parse-klook-html.mjs data/klook/tokyo.html data/klook/tokyo-activities.json tokyo
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { dirname, basename, join } from "path";

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log("Usage: node scripts/parse-klook-html.mjs <html-file> <output-file> [city]");
    console.log("  or: node scripts/parse-klook-html.mjs --all");
    console.log("\nExamples:");
    console.log(
        '  node scripts/parse-klook-html.mjs "data/klook/Best Things to Do in Tokyo 2025.html" data/klook/tokyo-activities.json tokyo',
    );
    console.log("  node scripts/parse-klook-html.mjs --all");
    process.exit(1);
}

// Extract JSON-LD data from HTML
function extractJsonLd(html) {
    const jsonLdBlocks = [];

    // Find all JSON-LD script blocks
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        try {
            const jsonText = match[1].trim();
            const data = JSON.parse(jsonText);
            jsonLdBlocks.push(data);
        } catch (e) {
            // Skip malformed JSON
        }
    }

    return jsonLdBlocks;
}

// Extract activities directly from HTML cards
function extractActivitiesFromHtml(html, city) {
    const activities = [];
    const seenIds = new Set();

    // Pattern to find activity card links with their context
    // Look for href patterns with activity IDs
    const urlPattern = /href="(https:\/\/www\.klook\.com\/activity\/(\d+)-([^"]+))"/g;
    let match;

    while ((match = urlPattern.exec(html)) !== null) {
        const url = match[1];
        const activityId = match[2];
        const slug = match[3];

        // Skip duplicates
        if (seenIds.has(activityId)) continue;
        seenIds.add(activityId);

        // Try to extract the title from nearby context (looking backwards and forwards)
        const contextStart = Math.max(0, match.index - 500);
        const contextEnd = Math.min(html.length, match.index + 200);
        const context = html.substring(contextStart, contextEnd);

        // Look for title in the link text
        const titleMatch = context.match(new RegExp(`href="${escapeRegex(url)}"[^>]*>([^<]+)</a>`, "i"));
        let name = titleMatch ? titleMatch[1].trim() : null;

        // Also try img alt attribute
        if (!name) {
            const altMatch = context.match(/alt="([^"]+)"/i);
            if (altMatch) {
                name = altMatch[1].trim();
            }
        }

        // Also try card-title
        const cardTitleMatch = context.match(/class="card-title"[^>]*>[\s\S]*?<a[^>]*>([^<]+)</i);
        if (!name && cardTitleMatch) {
            name = cardTitleMatch[1].trim();
        }

        // Fallback: derive from slug
        if (!name) {
            name = slug.replace(/-/g, " ").replace(/tokyo$/, "").trim();
            name = name.charAt(0).toUpperCase() + name.slice(1);
        }

        // Look for rating
        let rating = null;
        const ratingMatch = context.match(/★\s*([0-9.]+)/);
        if (ratingMatch) {
            rating = parseFloat(ratingMatch[1]);
        }

        // Look for image
        let image = null;
        const imgMatch = context.match(/src="([^"]+klook[^"]+\.(?:jpg|webp|png))"/i);
        if (imgMatch) {
            image = imgMatch[1];
            // Convert local file references to Klook CDN URLs
            if (image.includes("./")) {
                const filenameMatch = image.match(/\/([^/]+\.(?:jpg|webp|png))$/i);
                if (filenameMatch) {
                    image = `https://res.klook.com/image/upload/activities/${filenameMatch[1].replace(".webp", ".jpg")}`;
                }
            }
        }

        // Look for category/description
        let category = "experience";
        let description = null;
        const subTextMatch = context.match(/class="card-subText"[^>]*>[\s\S]*?([A-Za-z\s&]+)\s*•\s*([A-Za-z\s]+)/i);
        if (subTextMatch) {
            category = normalizeCategory(subTextMatch[1].trim());
            description = `${subTextMatch[1].trim()} • ${subTextMatch[2].trim()}`;
        }

        activities.push({
            id: `klook-${activityId}`,
            klookId: activityId,
            name: name,
            description: description,
            category: category,
            location: city,
            city: city,
            url: url,
            image: image,
            rating: rating,
            reviewCount: null,
            bookingCount: null,
            price: null,
            provider: "klook",
            sku: parseInt(activityId),
        });
    }

    return activities;
}

// Escape special regex characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Extract prices from HTML (correlate by activity URL/order)
function extractPrices(html) {
    const prices = [];

    // Pattern: US$ XX.XX or US$XX.XX
    const priceRegex = /US\$\s*([0-9]+(?:\.[0-9]+)?)/g;
    let match;

    while ((match = priceRegex.exec(html)) !== null) {
        prices.push(parseFloat(match[1]));
    }

    return prices;
}

// Extract review counts (e.g., "(50K+ reviews)" or "(1.2K+ reviews)")
function extractReviewCounts(html) {
    const counts = [];

    // Pattern: (XK+ reviews) or (X+ reviews) or (X reviews)
    const reviewRegex = /\(([0-9.]+)([KM]?)\+?\s*reviews?\)/gi;
    let match;

    while ((match = reviewRegex.exec(html)) !== null) {
        let count = parseFloat(match[1]);
        const multiplier = match[2].toUpperCase();

        if (multiplier === "K") {
            count *= 1000;
        } else if (multiplier === "M") {
            count *= 1000000;
        }

        counts.push(Math.round(count));
    }

    return counts;
}

// Extract booking counts (e.g., "500K+ Booked")
function extractBookingCounts(html) {
    const counts = [];

    // Pattern: XK+ Booked or X+ Booked
    const bookingRegex = /([0-9.]+)([KM]?)\+?\s*Booked/gi;
    let match;

    while ((match = bookingRegex.exec(html)) !== null) {
        let count = parseFloat(match[1]);
        const multiplier = match[2].toUpperCase();

        if (multiplier === "K") {
            count *= 1000;
        } else if (multiplier === "M") {
            count *= 1000000;
        }

        counts.push(Math.round(count));
    }

    return counts;
}

// Parse activity from JSON-LD item
function parseActivity(item, index, prices, reviewCounts, bookingCounts, city) {
    const product = item.item || item;

    // Extract activity ID from URL
    const urlMatch = product.url && product.url.match(/activity\/(\d+)/);
    const activityId = urlMatch ? urlMatch[1] : `klook-${index + 1}`;

    // Parse category from description (e.g., "Theme parks • Tokyo")
    let category = "Experience";
    let location = city;

    if (product.description) {
        const parts = product.description.split("•").map((p) => p.trim());
        if (parts.length >= 1) category = parts[0];
        if (parts.length >= 2) location = parts[1];
    }

    // Get price (if available, indexed by position)
    const price = prices[index] || null;

    // Get review count (if available)
    const reviewCount = reviewCounts[index] || null;

    // Get booking count (if available)
    const bookingCount = bookingCounts[index] || null;

    return {
        id: `klook-${activityId}`,
        klookId: activityId,
        name: product.name ? product.name.trim() : `Activity ${index + 1}`,
        description: product.description || null,
        category: normalizeCategory(category),
        categoryOriginal: category,
        location: location,
        city: city,
        url: product.url || null,
        image: product.image || null,
        rating: product.aggregateRating ? parseFloat(product.aggregateRating.ratingValue) : null,
        reviewCount: reviewCount,
        bookingCount: bookingCount,
        price: price ? {
            amount: price,
            currency: "USD",
            display: `US$ ${price.toFixed(2)}`,
        } : null,
        provider: "klook",
        sku: product.sku || null,
    };
}

// Normalize category names
function normalizeCategory(category) {
    const categoryMap = {
        "Theme parks": "theme_park",
        "Observation decks": "observation_deck",
        Museums: "museum",
        Tours: "tour",
        Transportation: "transport",
        "Food & dining": "dining",
        Shows: "show",
        Classes: "class",
        "Day trips": "day_trip",
        Attractions: "attraction",
        Experience: "experience",
        Tickets: "ticket",
    };

    return categoryMap[category] || "experience";
}

// Parse HTML file and extract activities
function parseKlookHtml(htmlPath, city) {
    console.log(`\nParsing: ${htmlPath}`);

    const html = readFileSync(htmlPath, "utf8");

    // Extract JSON-LD blocks
    const jsonLdBlocks = extractJsonLd(html);

    // Parse activities from JSON-LD
    let jsonLdActivities = [];
    const jsonLdIds = new Set();

    for (const block of jsonLdBlocks) {
        if (block["@type"] === "ItemList" && block.itemListElement) {
            console.log(`  Found ${block.itemListElement.length} activities in JSON-LD`);

            // Extract prices and counts from HTML
            const prices = extractPrices(html);
            const reviewCounts = extractReviewCounts(html);
            const bookingCounts = extractBookingCounts(html);

            console.log(`  Found ${prices.length} prices, ${reviewCounts.length} review counts, ${bookingCounts.length} booking counts`);

            jsonLdActivities = block.itemListElement.map((item, index) =>
                parseActivity(item, index, prices, reviewCounts, bookingCounts, city),
            );

            // Track IDs from JSON-LD
            for (const activity of jsonLdActivities) {
                if (activity && activity.klookId) {
                    jsonLdIds.add(activity.klookId);
                }
            }
            break;
        }
    }

    // Also extract activities from HTML cards to find additional ones
    const htmlActivities = extractActivitiesFromHtml(html, city);
    console.log(`  Found ${htmlActivities.length} activity URLs in HTML`);

    // Merge: JSON-LD activities take priority (they have better data)
    // Add HTML activities that aren't already in JSON-LD
    const mergedActivities = [...jsonLdActivities];
    let addedFromHtml = 0;

    for (const htmlActivity of htmlActivities) {
        if (!jsonLdIds.has(htmlActivity.klookId)) {
            mergedActivities.push(htmlActivity);
            addedFromHtml++;
        }
    }

    if (addedFromHtml > 0) {
        console.log(`  Added ${addedFromHtml} additional activities from HTML parsing`);
    }

    // Filter out any null/invalid activities
    const validActivities = mergedActivities.filter((a) => a && a.name);

    console.log(`  Total: ${validActivities.length} valid activities`);

    return validActivities;
}

// Process single file
function processFile(htmlPath, outputPath, city) {
    // Infer city from filename if not provided
    if (!city) {
        const filename = basename(htmlPath).toLowerCase();
        if (filename.includes("tokyo")) city = "tokyo";
        else if (filename.includes("kyoto")) city = "kyoto";
        else if (filename.includes("osaka")) city = "osaka";
        else if (filename.includes("nara")) city = "nara";
        else if (filename.includes("hiroshima")) city = "hiroshima";
        else if (filename.includes("hakone")) city = "hakone";
        else city = "unknown";
    }

    const activities = parseKlookHtml(htmlPath, city);

    if (activities.length === 0) {
        console.error(`  No activities extracted from ${htmlPath}`);
        return;
    }

    // Ensure output directory exists
    mkdirSync(dirname(outputPath), { recursive: true });

    // Write output
    const output = {
        source: "klook",
        city: city,
        extractedAt: new Date().toISOString(),
        count: activities.length,
        activities: activities,
    };

    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`  ✓ Saved ${activities.length} activities to ${outputPath}`);
}

// Process all Klook files in data/klook directory
function processAllFiles() {
    const klookDir = join(process.cwd(), "data/klook");

    if (!existsSync(klookDir)) {
        console.error(`Klook directory not found: ${klookDir}`);
        process.exit(1);
    }

    const htmlFiles = readdirSync(klookDir).filter((f) => f.endsWith(".html"));

    if (htmlFiles.length === 0) {
        console.error("No HTML files found in data/klook directory");
        process.exit(1);
    }

    console.log(`Found ${htmlFiles.length} HTML files to process`);

    const allActivities = {};

    for (const file of htmlFiles) {
        const htmlPath = join(klookDir, file);
        const outputPath = join(klookDir, file.replace(".html", ".json"));

        // Infer city from filename
        const filename = file.toLowerCase();
        let city = "unknown";
        if (filename.includes("tokyo")) city = "tokyo";
        else if (filename.includes("kyoto")) city = "kyoto";
        else if (filename.includes("osaka")) city = "osaka";
        else if (filename.includes("nara")) city = "nara";
        else if (filename.includes("hiroshima")) city = "hiroshima";
        else if (filename.includes("hakone")) city = "hakone";

        const activities = parseKlookHtml(htmlPath, city);

        if (activities.length > 0) {
            // Save individual file
            const output = {
                source: "klook",
                city: city,
                extractedAt: new Date().toISOString(),
                count: activities.length,
                activities: activities,
            };

            writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`  ✓ Saved ${activities.length} activities to ${outputPath}`);

            // Accumulate for combined output
            if (!allActivities[city]) {
                allActivities[city] = [];
            }
            allActivities[city].push(...activities);
        }
    }

    // Save combined index
    const indexPath = join(klookDir, "index.json");
    const index = {
        source: "klook",
        extractedAt: new Date().toISOString(),
        cities: Object.keys(allActivities),
        counts: Object.fromEntries(Object.entries(allActivities).map(([city, acts]) => [city, acts.length])),
        total: Object.values(allActivities).reduce((sum, acts) => sum + acts.length, 0),
    };

    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`\n✓ Saved index to ${indexPath}`);
    console.log(`  Total: ${index.total} activities across ${index.cities.length} cities`);
}

// Main
if (args[0] === "--all") {
    processAllFiles();
} else {
    const [htmlPath, outputPath, city] = args;
    processFile(htmlPath, outputPath, city);
}