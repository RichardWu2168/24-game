export class HttpError extends Error {
    constructor(public readonly status: number, public readonly body: { message?: string; error?: string; valid?: boolean }) {
        super(body.message ?? body.error ?? "Request failed.");
    }
}
