import { RequestHandlerParams, ROOT_OBJECT } from "./utils";

import { RequestHandlerParams } from "./utils";

export async function handleRequestPutMultipart({
    bucket,
    path,
    request,
}: RequestHandlerParams) {
    const url = new URL(request.url);

    const uploadId = new URLSearchParams(url.search).get("uploadId");
    const partNumberStr = new URLSearchParams(url.search).get("partNumber");
    if (!uploadId || !partNumberStr || !request.body)
        return new Response("Bad Request", { status: 400 });

    const multipartUpload = bucket.resumeMultipartUpload(path, uploadId);

    const partNumber = parseInt(partNumberStr);
    const uploadedPart = await multipartUpload.uploadPart(
        partNumber,
        request.body
    );

    const complete = request.headers.get("fd-complete"); // Check for "complete" header

    if (complete === "true") {  // If this is the final part
        try {
            await METADATA_KV.put(path, new Date().toUTCString()); // Update Last-Modified
        } catch (error) {
            console.error("Error updating Last-Modified in KV:", error);
            return new Response("Error updating Last-Modified", { status: 500 });
        }
    }

    return new Response(null, {
        headers: { "Content-Type": "application/json", etag: uploadedPart.etag },
    });
}

export async function handleRequestPut({
    bucket,
    path,
    request,
}: RequestHandlerParams) {
    const searchParams = new URLSearchParams(new URL(request.url).search);
    if (searchParams.has("uploadId")) {
        return handleRequestPutMultipart({ bucket, path, request });
    }

    if (request.url.endsWith("/")) {
        return new Response("Method Not Allowed", { status: 405 });
    }

    // Check if the parent directory exists
    if (!path.startsWith("_$flaredrive$/")) {
        const parentPath = path.replace(/(\/|^)[^/]*$/, "");
        const parentDir =
            parentPath === "" ? ROOT_OBJECT : await bucket.head(parentPath);
        if (parentDir === null) return new Response("Conflict", { status: 409 });
    }

    const thumbnail = request.headers.get("fd-thumbnail");
    const customMetadata = thumbnail ? { thumbnail } : undefined;

    const result = await bucket.put(path, request.body, {
        onlyIf: request.headers,
        httpMetadata: request.headers,
        customMetadata,
    });

    if (!result) return new Response("Preconditions failed", { status: 412 });

    try {
        await METADATA_KV.put(path, new Date().toUTCString()); // Update Last-Modified in KV
    } catch (error) {
        console.error("Error updating Last-Modified in KV:", error);
        // Important: Decide how to handle this error.  You might want to
        // return a 500 error, or you might want to log the error and
        // continue (allowing the upload to succeed even if the KV update fails).
        return new Response("Error updating Last-Modified", { status: 500 }); // Example: 500 error
    }

    return new Response("", { status: 201 });
}
