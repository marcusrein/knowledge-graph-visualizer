// We need to import the database functions
// Since we're in ES modules, we need to use dynamic import
const { initializeDatabase, getEntitiesForDate, createEntity } = await import('../lib/database.js');

console.log('🔍 Testing Database Connection...');

try {
  // Initialize database
  await initializeDatabase();
  console.log('✅ Database initialized successfully');

  // Test getting all entities
  const allEntities = await getEntitiesForDate('');
  console.log(`📊 Total entities in database: ${allEntities.length}`);
  
  if (allEntities.length > 0) {
    console.log('📝 Sample entity:', JSON.stringify(allEntities[0], null, 2));
  }

  // Test getting entities for today
  const today = new Date().toISOString().split('T')[0];
  const todayEntities = await getEntitiesForDate(today);
  console.log(`📅 Entities for today (${today}): ${todayEntities.length}`);

  // If no entities exist, create some test data
  if (allEntities.length === 0) {
    console.log('🔧 No entities found, creating test data...');
    
    const testEntities = [
      {
        nodeId: 'test-topic-1',
        label: 'Test Topic 1',
        type: 'topic',
        userAddress: 'test-user',
        visibility: 'public',
        x: 100,
        y: 100,
        properties: { description: 'Test topic for debugging' }
      },
      {
        nodeId: 'test-topic-2',
        label: 'Test Topic 2',
        type: 'topic',
        userAddress: 'test-user',
        visibility: 'public',
        x: 200,
        y: 200,
        properties: { description: 'Another test topic' }
      }
    ];

    for (const entity of testEntities) {
      try {
        const result = await createEntity(entity);
        console.log(`✅ Created entity: ${entity.label} (ID: ${result.id})`);
      } catch (error) {
        console.error(`❌ Failed to create entity ${entity.label}:`, error.message);
      }
    }

    // Test again after creating test data
    const newAllEntities = await getEntitiesForDate('');
    console.log(`📊 Total entities after test data creation: ${newAllEntities.length}`);
  }

  console.log('✅ Database test completed successfully');
  process.exit(0);

} catch (error) {
  console.error('❌ Database test failed:', error);
  process.exit(1);
} 