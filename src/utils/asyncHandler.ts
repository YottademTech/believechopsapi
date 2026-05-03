import type { RequestHandler } from "express";

type AsyncRequestHandler = (...args: Parameters<RequestHandler>) => Promise<ReturnType<RequestHandler>>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
