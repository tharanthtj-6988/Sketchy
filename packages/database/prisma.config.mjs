import 'dotenv/config';

/** @type {import('prisma').PrismaConfig} */
export default {
  schema: './prisma/schema.prisma',
  datasource: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
};
