import * as Joi from 'joi';

/**
 * @summary Validación de variables de entorno (.env)
 * @description
 * Define y valida todas las variables críticas necesarias para que la app
 * funcione correctamente. Si falta alguna o tiene un tipo incorrecto,
 * la aplicación no iniciará.
 */
export const validationSchema = Joi.object({
  // ---------------------------
  // 🔹 Configuración general
  // ---------------------------
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(7008),
  URL_HOST: Joi.string().default('localhost'),
  TZ: Joi.string().default('America/Caracas'),

  // ---------------------------
  // 🔹 Base de datos PostgreSQL
  // ---------------------------
  DB_HOST: Joi.string().required().messages({
    'any.required': '❌ DB_HOST es obligatorio',
  }),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().default('postgres'),
  DB_PASS: Joi.string().allow('').required().messages({
    'any.required': '❌ DB_PASS es obligatorio',
  }),
  DB_NAME: Joi.string().default('bd_gestion_medica'),

  // ---------------------------
  // 🔹 Redis principal (colas)
  // ---------------------------
  REDIS_HOST: Joi.string().required().messages({
    'any.required': '❌ REDIS_HOST es obligatorio',
  }),
  REDIS_PORT: Joi.number().default(6379),
  // Shared by cache, BullMQ and (unless REDIS_SESSION_PASS is set) the session client
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // ---------------------------
  // 🔹 Redis para sesiones
  // ---------------------------
  REDIS_SESSION_HOST: Joi.string().required().messages({
    'any.required': '❌ REDIS_SESSION_HOST es obligatorio',
  }),
  REDIS_SESSION_PORT: Joi.number().default(6379),
  REDIS_SESSION_PASS: Joi.string().allow('').default(''),

  // ---------------------------
  // 🔹 JWT
  // ---------------------------
  JWT_SECRET: Joi.string().required().messages({
    'any.required': '❌ JWT_SECRET es obligatorio',
  }),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
  JWT_REFRESH_SECRET: Joi.string().required().messages({
    'any.required': '❌ JWT_REFRESH_SECRET es obligatorio',
  }),

  // ---------------------------
  // 🔹 Cifrado
  // ---------------------------
  ENCRYPT_KEY: Joi.string().min(16).required().messages({
    'any.required': '❌ ENCRYPT_KEY es obligatorio',
  }),

  // ---------------------------
  // 🔹 Cache
  // ---------------------------
  // Default TTL in milliseconds (cache-manager v7); services pass their own per key
  CACHE_TTL_MS: Joi.number().integer().min(1000).default(300000),

  // ---------------------------
  // 🔹 Detector de cáncer de mama (servicio ML)
  // ---------------------------
  DETECTOR_URL: Joi.string().uri({ scheme: ['http', 'https'] }).required().messages({
    'any.required': '❌ DETECTOR_URL es obligatorio',
  }),
  DETECTOR_SECRET: Joi.string().required().messages({
    'any.required': '❌ DETECTOR_SECRET es obligatorio',
  }),
  DETECTOR_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
});
