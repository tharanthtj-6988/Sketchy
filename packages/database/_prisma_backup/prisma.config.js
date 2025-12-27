require('dotenv/config');

module.exports = {
  schema: './prisma/schema.prisma',
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL,
  },
};
