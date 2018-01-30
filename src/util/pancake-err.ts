export class PancakeError extends Error
{
  private status: string;
  private reason: string;
  private errorInfo: any;

  constructor(status: string, reason?: string, errInfo?: any) {
    super(reason);
    this.status = status;
    this.reason = reason;
    this.errorInfo = errInfo;
  }
}
