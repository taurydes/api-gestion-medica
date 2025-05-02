export default () => ({
  environment: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },

  database: {
    host: process.env.DB_HOST || 'localhost', // Valor predeterminado: localhost
    port: parseInt(process.env.DB_PORT || '5432', 10), // Valor predeterminado: 5432
    user: process.env.DB_USER || 'postgres', // Valor predeterminado: postgres
    pass: process.env.DB_PASS || '123456', // Valor predeterminado: password
    name: process.env.DB_NAME || 'db_api_graphql_base', // Valor predeterminado: my_database
  },
});