import configFactory from '../configuration/configuration';

export const configuration = configFactory(); // evalúa variables de entorno
export const DB_MAIN_NAME = configuration.database.name;
export const DatabaseConnectionName = {
  DB_MAIN: DB_MAIN_NAME,
};

export default configFactory;