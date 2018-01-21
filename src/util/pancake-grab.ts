//
// For those of us tired of wrapping everything in try/catch blocks...
// http://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
// [err, returnData] = await grab(promise);
//
export function grab(promise: Promise<any>) {
    return promise.then(function (data: any) {
        return [null, data];
    })["catch"](function (err: any) { return [err]; });
}
