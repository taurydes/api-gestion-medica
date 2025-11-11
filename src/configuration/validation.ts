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
  DB_PASS: Joi.string().allow('').default('123456'),
  DB_NAME: Joi.string().default('db_api_graphql_base'),

  // ---------------------------
  // 🔹 Redis principal (colas)
  // ---------------------------
  REDIS_HOST: Joi.string().required().messages({
    'any.required': '❌ REDIS_HOST es obligatorio',
  }),
  REDIS_PORT: Joi.number().default(6379),

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

  // ---------------------------
  // 🔹 Correo (SMTP o Mailpit)
  // ---------------------------
  EMAIL_HOST: Joi.string().required().messages({
    'any.required': '❌ EMAIL_HOST es obligatorio',
  }),
  EMAIL_PORT: Joi.number().default(1025),
  EMAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  EMAIL_USER: Joi.string().allow('').default('usuario'),
  EMAIL_PASS: Joi.string().allow('').default('clave'),

  // ---------------------------
  // 🔹 Token de validación
  // ---------------------------
  TOKEN_VALIDATOR: Joi.string().required().messages({
    'any.required': '❌ TOKEN_VALIDATOR es obligatorio',
  }),

  // ---------------------------
  // 🔹 Bull Board
  // ---------------------------
  BULL_BOARD_PORT: Joi.number().default(9999),

  // ---------------------------
  // 🔹 Cache
  // ---------------------------
  CACHE_TTL: Joi.number().default(3600),
  CACHE_MAX: Joi.number().default(1000),
});
