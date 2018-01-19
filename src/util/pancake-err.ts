export class PancakeError extends Error
{
  private _status: string;
  private _reason: string;
  private _errorInfo: any;

  constructor(status: string, reason?: string, errInfo?: any) {
    super(reason);
    this._status = status;
    this._reason = reason;
    this._errorInfo = errInfo;
  }
}
