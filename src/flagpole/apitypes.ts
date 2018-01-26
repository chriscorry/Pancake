export interface EndpointInfo {
  handler:      Function,
  requestType?: string,
  path?:        string,
  event?:       string,
  route?:       string
}


export interface EndpointResponse {
  status?: number,
  result?: any,
  err?: any
}

export type EndpointHandler = (payload: any) => EndpointResponse;
