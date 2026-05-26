/**
 * Централизованная обработка ошибок
 */

export const handleError = (error: unknown, context: string) => {
  console.error(`[${context}]`, error);
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'Произошла неизвестная ошибка';
};

export const handleAsyncStorageError = (error: unknown) => {
  return handleError(error, 'AsyncStorage');
};

export const handleLocationError = (error: unknown) => {
  return handleError(error, 'Location');
};
