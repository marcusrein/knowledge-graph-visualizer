// Simple test to verify Postgres connection
import { sql } from '@vercel/postgres';

async function testConnection() {
  try {
    console.log('Testing Postgres connection...');
    
    const result = await sql`SELECT NOW() as current_time`;
    console.log('✅ Database connected successfully!');
    console.log('Current time:', result.rows[0].current_time);
    
    // Test if tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    console.log('📋 Existing tables:', tables.rows.map(t => t.table_name));
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
}

testConnection(); 