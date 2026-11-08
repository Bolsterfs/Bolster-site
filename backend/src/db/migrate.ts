import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import 'dotenv/config'

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
  })

  const db = drizzle(pool)

  console.log('Running database migrations...')

  await migrate(db, { migrationsFolder: './src/db/migrations' })

  console.log('Migrations complete.')
  await pool.end()
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
