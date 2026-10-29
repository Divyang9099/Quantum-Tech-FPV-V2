import { ZodError } from 'zod';

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false, code: 'VALIDATION', message: 'Please check the highlighted fields.',
      details: err.flatten().fieldErrors,
    });
  }
  if (err.status) {
    return res.status(err.status).json({ success: false, code: err.code, message: err.message, details: err.details });
  }
  console.error(err);
  res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
}
