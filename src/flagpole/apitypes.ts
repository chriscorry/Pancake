export interface EndpointResponse {
  status?: number,
  result?: any,
  err?: any
}

export type EndpointHandler = (payload: any) => EndpointResponse;
