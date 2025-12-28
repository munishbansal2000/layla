# Layla.AI Clone - AI Travel Planner

A full-featured clone of Layla.ai, an AI-powered travel planning platform built with Next.js 14, TypeScript, and Tailwind CSS.

![Layla Clone](https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800)

## Features

### 🤖 AI-Powered Chat Interface
- Conversational trip planning with AI assistant
- Suggested prompts for quick interactions
- Real-time message streaming
- Context-aware responses

### 📅 Itinerary Management
- Day-by-day trip planning
- Activity cards with detailed information
- Drag-and-drop reordering (coming soon)
- Weather forecasts per day

### 🗺️ Destination Discovery
- Popular destination cards
- Category filtering (romantic, adventure, beach, etc.)
- Search functionality
- Budget indicators

### 💾 Data Persistence (API Ready)
- RESTful API endpoints
- Trip CRUD operations
- Chat conversation handling
- Destination management

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **State Management**: Zustand
- **Icons**: Lucide React
- **Data Fetching**: React Query (ready for integration)

## Project Structure

```
src/
├── app/
│   ├── api/                    # API Routes
│   │   ├── chat/               # Chat endpoint
│   │   ├── destinations/       # Destinations endpoint
│   │   └── trips/              # Trip CRUD endpoints
│   ├── explore/                # Explore destinations page
│   ├── trips/                  # My trips pages
│   │   ├── [id]/               # Individual trip page
│   │   └── page.tsx            # Trips list page
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page
├── components/
│   ├── chat/
│   │   └── ChatInterface.tsx   # Chat UI component
│   ├── itinerary/
│   │   ├── ActivityCard.tsx    # Activity card component
│   │   ├── DayTimeline.tsx     # Day timeline component
│   │   └── ItineraryView.tsx   # Full itinerary view
│   ├── layout/
│   │   └── Header.tsx          # Navigation header
│   └── ui/
│       ├── Avatar.tsx          # Avatar component
│       ├── Badge.tsx           # Badge component
│       ├── Button.tsx          # Button component
│       ├── Card.tsx            # Card component
│       ├── DestinationCard.tsx # Destination card
│       └── Input.tsx           # Input component
├── data/
│   └── mock-data.ts            # Mock data for development
├── hooks/                      # Custom React hooks
├── lib/
│   └── utils.ts                # Utility functions
├── store/
│   └── trip-store.ts           # Zustand store
└── types/
    └── index.ts                # TypeScript types/schemas
```

## Data Schema

### Core Types

```typescript
// Trip
interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: Location;
  startDate: Date;
  endDate: Date;
  days: DayPlan[];
  preferences: TripPreferences;
  status: TripStatus;
  travelers: number;
  // ...more fields
}

// Activity
interface Activity {
  id: string;
  name: string;
  description: string;
  type: ActivityType;
  location: Location;
  rating?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  duration?: number;
  // ...more fields
}

// DayPlan
interface DayPlan {
  id: string;
  dayNumber: number;
  date: Date;
  title: string;
  items: ItineraryItem[];
  weatherForecast?: WeatherInfo;
}
```

## API Endpoints

### Trips
- `GET /api/trips` - Get all trips
- `POST /api/trips` - Create a new trip
- `GET /api/trips/[id]` - Get a specific trip
- `PUT /api/trips/[id]` - Update a trip
- `PATCH /api/trips/[id]` - Partial update (add/remove activities)
- `DELETE /api/trips/[id]` - Delete a trip
- `POST /api/trips/generate` - AI-generate a trip

### Chat
- `POST /api/chat` - Send a message and get AI response

### Destinations
- `GET /api/destinations` - Get popular destinations

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- OpenAI API key (optional, for AI features)

### Installation

```bash
# Navigate to project directory
cd layla-clone

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Add your OpenAI API key to .env.local
# OPENAI_API_KEY=sk-your-api-key-here

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### OpenAI Integration

The app uses OpenAI's GPT-4o-mini model for:
- **Chat responses**: Natural conversation about travel planning
- **Itinerary generation**: Full day-by-day trip planning with activities, restaurants, and tips

To enable AI features:
1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add it to your `.env.local` file:
   ```
   OPENAI_API_KEY=sk-your-api-key-here
   ```

Without an API key, the app falls back to mock responses.

### Building for Production

```bash
npm run build
npm start
```

## Future Enhancements

- [ ] Map integration with Google Maps/Mapbox
- [x] ~~Real AI integration (OpenAI GPT-4)~~ ✅ Completed!
- [ ] User authentication
- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Drag-and-drop activity reordering
- [ ] Trip sharing functionality
- [ ] PDF export
- [ ] Mobile app with React Native
- [ ] Booking integrations (hotels, flights)
- [ ] Real-time collaboration

## Design Decisions

1. **Next.js App Router**: Leveraging the latest Next.js features for optimal performance
2. **Zustand over Redux**: Simpler state management for this scale
3. **Tailwind CSS**: Rapid UI development with utility classes
4. **Framer Motion**: Smooth, professional animations
5. **TypeScript**: Full type safety across the codebase

## License

MIT License - Feel free to use this for learning or personal projects!
