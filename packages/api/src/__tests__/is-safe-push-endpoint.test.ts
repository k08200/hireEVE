import { describe, expect, it } from "vitest";
import { isSafePushEndpoint } from "../is-safe-push-endpoint.js";

describe("isSafePushEndpoint", () => {
  it("accepts a normal public HTTPS endpoint", () => {
    expect(isSafePushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isSafePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/xyz")).toBe(true);
  });

  it("rejects non-HTTPS protocols", () => {
    expect(isSafePushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isSafePushEndpoint("ftp://example.com/foo")).toBe(false);
  });

  it("rejects loopback and link-local hostnames", () => {
    expect(isSafePushEndpoint("https://localhost/x")).toBe(false);
    expect(isSafePushEndpoint("https://LOCALHOST/x")).toBe(false);
    expect(isSafePushEndpoint("https://127.0.0.1/x")).toBe(false);
    expect(isSafePushEndpoint("https://[::1]/x")).toBe(false);
  });

  it("rejects internal and .local domains", () => {
    expect(isSafePushEndpoint("https://service.internal/x")).toBe(false);
    expect(isSafePushEndpoint("https://printer.local/x")).toBe(false);
  });

  it("rejects RFC1918 and link-local IPv4 ranges", () => {
    expect(isSafePushEndpoint("https://10.0.0.1/x")).toBe(false);
    expect(isSafePushEndpoint("https://10.255.255.255/x")).toBe(false);
    expect(isSafePushEndpoint("https://172.16.0.1/x")).toBe(false);
    expect(isSafePushEndpoint("https://172.31.255.1/x")).toBe(false);
    expect(isSafePushEndpoint("https://192.168.1.1/x")).toBe(false);
    expect(isSafePushEndpoint("https://169.254.169.254/x")).toBe(false);
    expect(isSafePushEndpoint("https://0.0.0.0/x")).toBe(false);
  });

  it("accepts public IPv4 addresses", () => {
    expect(isSafePushEndpoint("https://8.8.8.8/x")).toBe(true);
    expect(isSafePushEndpoint("https://1.1.1.1/x")).toBe(true);
    expect(isSafePushEndpoint("https://172.15.0.1/x")).toBe(true); // just outside 172.16/12
    expect(isSafePushEndpoint("https://172.32.0.1/x")).toBe(true); // just outside 172.16/12
  });

  it("rejects malformed URLs", () => {
    expect(isSafePushEndpoint("not a url")).toBe(false);
    expect(isSafePushEndpoint("")).toBe(false);
  });
});
