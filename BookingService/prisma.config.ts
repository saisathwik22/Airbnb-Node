import { defineConfig } from 'prisma/config';
import "dotenv/config";

export default defineConfig({
  schema: './prisma/schema.prisma',
   datasource: {
    url: process.env.DATABASE_URL    // Explicitly links the CLI to your DB
  },
  // remove the datasource block entirely
});