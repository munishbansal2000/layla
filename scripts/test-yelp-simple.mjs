/**
 * Simple Test for Yelp Fusion API
 * Run with: node scripts/test-yelp-simple.mjs
 */

const YELP_API_KEY = "peYG3dMScl5QIzRQSZRCjtK0elQYw3kshhvQs0fEyP1NHNqxw4buSPkLPcEp5i2pamAGp95C4oDn-0NrSRm1G0QjI8CZjNK9DoR2KYSy0GicCwmuc-qCvgNJWiJPaXYx";
const BASE_URL = "https://api.yelp.com/v3";

async function testAPI() {
    console.log("\n🍽️ Yelp Fusion API Integration Test\n");
    console.log("=".repeat(50));

    // Test 1: Search Restaurants in Paris
    console.log("\n📍 Test 1: Search Restaurants in Paris");
    try {
        const response = await fetch(
            `${BASE_URL}/businesses/search?location=Paris,France&categories=restaurants&limit=5`, {
                headers: {
                    Authorization: `Bearer ${YELP_API_KEY}`,
                    Accept: "application/json",
                },
            }
        );
        const data = await response.json();

        if (response.ok && data.businesses) {
            console.log(`   ✅ Success! Found ${data.total} restaurants`);
            console.log(`\n   Top 5 restaurants:`);

            data.businesses.forEach((biz, i) => {
                const price = biz.price || "N/A";
                const cuisine = biz.categories.map(c => c.title).join(", ");
                console.log(`   ${i + 1}. ${biz.name}`);
                console.log(`      ⭐ ${biz.rating} (${biz.review_count} reviews) | 💰 ${price}`);
                console.log(`      🍽️ ${cuisine}`);
                console.log(`      📍 ${biz.location.address1}, ${biz.location.city}`);
                console.log("");
            });

            // Test 2: Get Business Details
            if (data.businesses.length > 0) {
                const firstBiz = data.businesses[0];
                console.log(`\n📋 Test 2: Get Details for "${firstBiz.name}"`);

                const detailsResponse = await fetch(
                    `${BASE_URL}/businesses/${firstBiz.id}`, {
                        headers: {
                            Authorization: `Bearer ${YELP_API_KEY}`,
                            Accept: "application/json",
                        },
                    }
                );
                const details = await detailsResponse.json();

                if (detailsResponse.ok) {
                    console.log(`   ✅ Success!`);
                    console.log(`   📞 Phone: ${details.display_phone || "N/A"}`);
                    console.log(`   🌐 URL: ${details.url?.substring(0, 50)}...`);
                    if (details.hours && details.hours[0]) {
                        console.log(`   🕐 Open now: ${details.hours[0].is_open_now ? "Yes ✅" : "No ❌"}`);
                    }
                    if (details.photos && details.photos.length > 0) {
                        console.log(`   📷 Photos: ${details.photos.length} available`);
                    }
                } else {
                    console.log(`   ❌ Failed: ${JSON.stringify(details)}`);
                }

                // Test 3: Get Reviews
                console.log(`\n💬 Test 3: Get Reviews for "${firstBiz.name}"`);

                const reviewsResponse = await fetch(
                    `${BASE_URL}/businesses/${firstBiz.id}/reviews?limit=3`, {
                        headers: {
                            Authorization: `Bearer ${YELP_API_KEY}`,
                            Accept: "application/json",
                        },
                    }
                );
                const reviews = await reviewsResponse.json();

                if (reviewsResponse.ok && reviews.reviews) {
                    console.log(`   ✅ Success! ${reviews.total} total reviews`);
                    console.log(`\n   Sample reviews:`);
                    reviews.reviews.forEach((review, i) => {
                        console.log(`   ${i + 1}. "${review.text.substring(0, 80)}..."`);
                        console.log(`      ⭐ ${review.rating}/5 by ${review.user.name}`);
                    });
                } else {
                    console.log(`   ❌ Failed: ${JSON.stringify(reviews)}`);
                }
            }

        } else {
            console.log(`   ❌ Failed: ${JSON.stringify(data)}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ Yelp API test complete!\n");
}

testAPI();