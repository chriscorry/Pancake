export interface EndpointInfo {
  requestType?: string,
  path?:        string,
  event?:       string,
  handler:      Function,
  route?:       string
}


export interface EndpointResponse {
  status?: number,
  result?: any,
  err?: any
}

export type EndpointHandler = (payload: any) => EndpointResponse;
