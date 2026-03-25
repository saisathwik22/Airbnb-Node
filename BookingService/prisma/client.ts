// import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import 'dotenv/config';
// import { PrismaClient } from "./generated/prisma/internal/class";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);

const prismaClient = new PrismaClient({ adapter });

export default prismaClient;