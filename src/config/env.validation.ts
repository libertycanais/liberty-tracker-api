import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  ENCRYPTION_KEY: Joi.string().min(16).required(),
  PORT: Joi.number().default(3001),
  CORS_ORIGIN: Joi.string().required(),
  META_API_VERSION: Joi.string().default('v21.0'),
});
