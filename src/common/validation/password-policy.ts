/** Minimum length of every new password (create, change, reset); login keeps 6 so older accounts still sign in (MJ-46). */
export const PASSWORD_MIN_LENGTH = 8;

export const passwordMinLengthMessage = (subject = 'La contraseña') =>
  `${subject} debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
