import 'dotenv/config';

export default {
  schema: './prisma/schema.prisma',
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL!,
  },
};
