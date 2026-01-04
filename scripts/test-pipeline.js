const BASE_URL = 'http://localhost:3000';

const testItinerary = {
  destination: "Tokyo",
  startDate: "2024-03-15",
  endDate: "2024-03-17",
  tripId: "test-pipeline-trip",
  days: [{
    dayNumber: 1,
    date: "2024-03-15",
    city: "Tokyo",
    slots: [
      {
        slotId: "slot-1",
        slotType: "activity",
        timeSlot: { start: "09:00", end: "11:00" },
        options: [{
          id: "opt-1",
          activity: { name: "Senso-ji Temple", category: "temple", duration: 120, tags: ["outdoor"] }
        }]
      },
      {
        slotId: "slot-2",
        slotType: "meal",
        timeSlot: { start: "12:00", end: "13:00" },
        options: [{
          id: "opt-2",
          activity: { name: "Ramen Lunch", category: "restaurant", duration: 60, tags: ["food"] }
        }]
      },
      {
        slotId: "slot-3",
        slotType: "activity",
        timeSlot: { start: "14:00", end: "16:00" },
        fragility: { bookingRequired: true },
        options: [{
          id: "opt-3",
          activity: { name: "teamLab Borderless", category: "museum", duration: 120, tags: ["indoor"] }
        }]
      }
    ]
  }]
};

async function startExecution() {
  console.log('\n🚀 Starting execution...');
  const response = await fetch(BASE_URL + '/api/execution/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripId: 'test-pipeline-trip', itinerary: testItinerary, dayIndex: 0 })
  });
  const result = await response.json();
  console.log('Start result:', result.success ? '✅ Success' : '❌ Failed - ' + (result.error || ''));
  return result;
}

async function enqueueEvent(eventType, data) {
  console.log('📤 Enqueuing ' + eventType + '...');
  const response = await fetch(BASE_URL + '/api/execution/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId: 'test-pipeline-trip',
      custom: { type: eventType, source: 'simulator', priority: data.priority || 'normal', title: data.title, message: data.message, slotId: data.slotId }
    })
  });
  const result = await response.json();
  console.log('  -> ' + (result.success ? '✅' : '❌'));
  return result;
}

async function pollEvents(withPipeline) {
  const url = BASE_URL + '/api/execution/queue?tripId=test-pipeline-trip' + (withPipeline ? '' : '&pipeline=false');
  const response = await fetch(url);
  return await response.json();
}

async function runTest() {
  console.log('============================================================');
  console.log('🧪 EVENT PIPELINE TEST');
  console.log('============================================================');

  try {
    await startExecution();

    console.log('\n📦 Enqueuing 3 test events...');
    await enqueueEvent('duration_warning', { priority: 'normal', title: 'Taking longer', message: 'Been here 90 mins', slotId: 'slot-1' });
    await enqueueEvent('booking_reminder', { priority: 'high', title: 'teamLab at 2PM', message: 'Leave by 1:30', slotId: 'slot-3' });
    await enqueueEvent('arrival', { priority: 'low', title: 'Arrived at Ramen', message: 'You arrived', slotId: 'slot-2' });

    console.log('\n📥 Polling WITH pipeline...');
    const result = await pollEvents(true);
    
    console.log('\n============================================================');
    console.log('📊 RESULTS');
    console.log('============================================================');
    console.log('Pipeline stats:', JSON.stringify(result.pipeline, null, 2));
    console.log('\nEvents shown (' + (result.events?.length || 0) + '):');
    (result.events || []).forEach((e, i) => {
      console.log('  ' + (i+1) + '. [' + e.type + '] ' + e.title);
      if (e.actions) console.log('     Actions: ' + e.actions.map(a => a.label).join(', '));
    });

    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

runTest();
