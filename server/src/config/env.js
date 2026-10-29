import 'dotenv/config';

export const env = {
  port: process.env.PORT || 4000,
  mongo: process.env.MONGODB_URI,
  access: process.env.JWT_ACCESS_SECRET,
  refresh: process.env.JWT_REFRESH_SECRET,
  apiKey: process.env.PUBLIC_API_KEY,
  origins: [process.env.PORTAL_ORIGIN, process.env.WEBSITE_ORIGIN].filter(Boolean),
  demo: process.env.DEMO_MODE === 'true',
};
