import { notFound } from "./utils";
import { RequestHandlerParams } from "./utils";

// Assuming you have your KV namespace bound to a variable called METADATA_KV
// If not, make sure to bind it in your Cloudflare Worker settings

export async function handleRequestGet({
    bucket,
    path,
    request,
}: RequestHandlerParams) {
    const obj = await bucket.get(path, {
        onlyIf: request.headers, // Keep these options
        range: request.headers,   // Keep these options
    });

    if (obj === null) return notFound();
    if (!("body" in obj))
        return new Response("Preconditions failed", { status: 412 });

    try {
        let lastModified = await METADATA_KV.get(path); // Use the path as the key

        if (!lastModified) {
            lastModified = obj.httpMetadata?.lastModified || new Date().toUTCString(); // From R2 or current time.  Use optional chaining to handle undefined httpMetadata
        }


        const headers = new Headers();
        obj.writeHttpMetadata(headers); // Copy existing metadata

        headers.set('Last-Modified', lastModified); // Add Last-Modified header

        if (path.startsWith("_$flaredrive$/thumbnails/"))
            headers.set("Cache-Control", "max-age=31536000");


        const newResponse = new Response(obj.body, { headers });

        const currentEtag = obj.httpMetadata?.etag; // Or a hash of the file content
        const previousEtag = request.headers.get('If-None-Match');

        if (!previousEtag || previousEtag !== currentEtag) {
            await METADATA_KV.put(path, new Date().toUTCString()); // Update KV if content changed
        }

        return newResponse;

    } catch (error) {
        console.error("Error setting/getting last modified time", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}
