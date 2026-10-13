import test from "node:test";
import assert from "node:assert/strict";
import {
  onRequest,
  isUnsafePath,
  normalizePath,
  isValidContentPath,
  markdownSiblingPath,
  prefersMarkdown,
  estimateTokens,
} from "../functions/_middleware.js";

test("isUnsafePath: rejects traversal and backslashes in raw and parsed paths", () => {
  const unsafeCases = [
    // Dot-dot traversal
    ["https://example.com/..", "/"],
    ["https://example.com/../", "/"],
    ["https://example.com/foo/../bar", "/bar"],
    ["https://example.com/foo/..", "/foo/.."],
    ["https://example.com/model-half-life/..", "/model-half-life/.."],
    // Encoded dot traversal
    ["https://example.com/%2e%2e", "/"],
    ["https://example.com/%2e%2e/", "/"],
    ["https://example.com/%2E%2E/", "/"],
    ["https://example.com/foo/%2e%2e/bar", "/foo/%2e%2e/bar"],
    ["https://example.com/foo/%2e./bar", "/foo/%2e./bar"],
    ["https://example.com/foo/.%2e/bar", "/foo/.%2e/bar"],
    ["https://example.com/foo/..%2f_headers", "/foo/..%2f_headers"],
    ["https://example.com/..%2f..%2fstatic/_headers", "/..%2f..%2fstatic/_headers"],
    // Backslashes (raw and encoded)
    ["https://example.com/foo\\bar", "/foo/bar"],
    ["https://example.com/foo%5cbar", "/foo%5cbar"],
    ["https://example.com/foo%5Cbar", "/foo%5Cbar"],
    ["https://example.com/\\foo", "/foo"],
    // Encoded slashes
    ["https://example.com/foo%2fbar", "/foo%2fbar"],
    ["https://example.com/foo%2Fbar", "/foo%2Fbar"],
    // Nested percent encoding
    ["https://example.com/foo/%252e%252e/bar", "/foo/%252e%252e/bar"],
    ["https://example.com/foo/%255cbar", "/foo/%255cbar"],
    // Control characters and null bytes
    ["https://example.com/foo%00bar", "/foo%00bar"],
    ["https://example.com/foo%01bar", "/foo%01bar"],
  ];

  for (const [url, pathname] of unsafeCases) {
    assert.equal(
      isUnsafePath(url, pathname),
      true,
      `Expected ${url} (${pathname}) to be flagged as unsafe`
    );
  }
});

test("isUnsafePath: accepts clean content paths", () => {
  const safeCases = [
    ["https://example.com/model-half-life/", "/model-half-life/"],
    ["https://example.com/model-half-life", "/model-half-life"],
    ["https://example.com/training/intro/", "/training/intro/"],
    ["https://example.com/posts/model-half-life/", "/posts/model-half-life/"],
    ["https://example.com/tutorials/deep-dive/", "/tutorials/deep-dive/"],
  ];

  for (const [url, pathname] of safeCases) {
    assert.equal(
      isUnsafePath(url, pathname),
      false,
      `Expected ${url} (${pathname}) to be considered safe`
    );
  }
});

test("normalizePath: collapses slashes and ensures leading slash", () => {
  assert.equal(normalizePath("/foo/bar/"), "/foo/bar/");
  assert.equal(normalizePath("//foo///bar//"), "/foo/bar/");
  assert.equal(normalizePath("foo/bar"), "/foo/bar");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("///"), "/");
});

test("isValidContentPath: validates allowed published content roots", () => {
  // Allowed: root-level post slugs
  assert.equal(isValidContentPath("/model-half-life/"), true);
  assert.equal(isValidContentPath("/model-half-life"), true);
  assert.equal(isValidContentPath("/projects/"), true);
  assert.equal(isValidContentPath("/are-pwas-cooked/"), true);

  // Allowed: /posts/:slug
  assert.equal(isValidContentPath("/posts/model-half-life/"), true);
  assert.equal(isValidContentPath("/posts/model-half-life"), true);

  // Allowed: /training/:slug and /tutorials/:slug
  assert.equal(isValidContentPath("/training/intro/"), true);
  assert.equal(isValidContentPath("/training/intro"), true);
  assert.equal(isValidContentPath("/training/deep-dive/step-1/"), true);
  assert.equal(isValidContentPath("/tutorials/web-ai/"), true);

  // Rejected: root / home
  assert.equal(isValidContentPath("/"), false);

  // Rejected: section indexes
  assert.equal(isValidContentPath("/posts/"), false);
  assert.equal(isValidContentPath("/posts"), false);
  assert.equal(isValidContentPath("/training/"), false);

  // Rejected: reserved asset / taxonomy roots
  assert.equal(isValidContentPath("/authors/paulkinlan/"), false);
  assert.equal(isValidContentPath("/authors/"), false);
  assert.equal(isValidContentPath("/tags/web/"), false);
  assert.equal(isValidContentPath("/categories/ai/"), false);
  assert.equal(isValidContentPath("/images/claw.png"), false);
  assert.equal(isValidContentPath("/images/foo"), false);
  assert.equal(isValidContentPath("/data/drops.tsv"), false);
  assert.equal(isValidContentPath("/css/style.css"), false);
  assert.equal(isValidContentPath("/js/main.js"), false);
  assert.equal(isValidContentPath("/where-prompts-run-demo/"), false);

  // Rejected: uppercase reserved roots and section indexes
  assert.equal(isValidContentPath("/POSTS/"), false);
  assert.equal(isValidContentPath("/POSTS"), false);
  assert.equal(isValidContentPath("/CSS/"), false);
  assert.equal(isValidContentPath("/CSS"), false);
  assert.equal(isValidContentPath("/Images/"), false);
  assert.equal(isValidContentPath("/AUTHORS/"), false);
  assert.equal(isValidContentPath("/STATIC/"), false);
  assert.equal(isValidContentPath("/API/"), false);

  // Rejected: hidden files / dotfiles
  assert.equal(isValidContentPath("/_headers"), false);
  assert.equal(isValidContentPath("/.git/config"), false);
  assert.equal(isValidContentPath("/.env"), false);

  // Rejected: arbitrary deep or invalid paths
  assert.equal(isValidContentPath("/foo/bar/baz"), false);
  assert.equal(isValidContentPath("/invalid$slug/"), false);
  assert.equal(isValidContentPath("/invalid slug/"), false);
});

test("onRequest: serves markdown variant for valid post with Accept: text/markdown", async () => {
  const assetFetches = [];
  const fakeEnv = {
    ASSETS: {
      fetch: async (req) => {
        assetFetches.push(new URL(req.url).pathname);
        return new Response("# Model Half-Life\nSome markdown text", {
          status: 200,
          headers: { "Content-Type": "text/markdown" },
        });
      },
    },
  };

  const req = new Request("https://aifocus.blog/model-half-life/", {
    headers: { Accept: "text/markdown" },
  });

  let nextCalled = false;
  const context = {
    request: req,
    next: async () => {
      nextCalled = true;
      return new Response("<html>Post</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    },
    env: fakeEnv,
  };

  const res = await onRequest(context);
  assert.equal(nextCalled, false);
  assert.equal(assetFetches.length, 1);
  assert.equal(assetFetches[0], "/model-half-life/index.md");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(res.headers.get("Vary"), "Accept");
  assert.ok(res.headers.has("x-markdown-tokens"));
  const text = await res.text();
  assert.match(text, /# Model Half-Life/);
});

test("onRequest: normalizes slashes for valid post request", async () => {
  const assetFetches = [];
  const fakeEnv = {
    ASSETS: {
      fetch: async (req) => {
        assetFetches.push(new URL(req.url).pathname);
        return new Response("# Normalized", {
          status: 200,
          headers: { "Content-Type": "text/markdown" },
        });
      },
    },
  };

  const req = new Request("https://aifocus.blog//model-half-life///", {
    headers: { Accept: "text/markdown" },
  });

  const context = {
    request: req,
    next: async () => new Response("fallback"),
    env: fakeEnv,
  };

  const res = await onRequest(context);
  assert.equal(assetFetches.length, 1);
  assert.equal(assetFetches[0], "/model-half-life/index.md");
  assert.equal(res.status, 200);
});

test("onRequest: real Request canonicalizes dot-segments and stays confined to content root", async () => {
  // WHATWG Request constructor normalizes dot segments (/../) in standard URLs.
  // Verify that a real request with dot-segments resolves cleanly, isValidContentPath
  // confines the target to an allowed content root, and ASSETS.fetch only fetches the valid slug sibling.
  const req = new Request("https://aifocus.blog/foo/../model-half-life/", {
    headers: { Accept: "text/markdown" },
  });

  assert.equal(req.url, "https://aifocus.blog/model-half-life/");
  const parsedPath = new URL(req.url).pathname;
  assert.equal(isValidContentPath(parsedPath), true);

  const assetFetches = [];
  const fakeEnv = {
    ASSETS: {
      fetch: async (assetReq) => {
        assetFetches.push(new URL(assetReq.url).pathname);
        return new Response("# Model Half-Life\nContent", { status: 200 });
      },
    },
  };

  const context = {
    request: req,
    next: async () => new Response("fallback"),
    env: fakeEnv,
  };

  const res = await onRequest(context);
  assert.equal(res.status, 200);
  assert.equal(assetFetches.length, 1);
  assert.equal(assetFetches[0], "/model-half-life/index.md");
});

test("onRequest: encoded traversal and backslashes are rejected without calling ASSETS.fetch", async () => {
  // Non-canonicalized encoded traversal and backslash sequences retain their raw input
  // in a real Request object; isUnsafePath ensures ASSETS.fetch is never called.
  const attackUrls = [
    "https://aifocus.blog/foo/..%2f_headers",
    "https://aifocus.blog/..%2f..%2fstatic/_headers",
    "https://aifocus.blog/foo%5cbar",
    "https://aifocus.blog/foo%5Cbar",
    "https://aifocus.blog/foo/%252e%252e/bar",
  ];

  for (const attackUrl of attackUrls) {
    let assetFetchCalled = false;
    const fakeEnv = {
      ASSETS: {
        fetch: async () => {
          assetFetchCalled = true;
          return new Response("sensitive data", { status: 200 });
        },
      },
    };

    let nextCalled = false;
    const req = new Request(attackUrl, {
      headers: { Accept: "text/markdown" },
    });

    const context = {
      request: req,
      next: async () => {
        nextCalled = true;
        return new Response("<html>Default response</html>", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      },
      env: fakeEnv,
    };

    const res = await onRequest(context);
    assert.equal(
      assetFetchCalled,
      false,
      `ASSETS.fetch must never be called for traversal url: ${attackUrl}`
    );
    assert.equal(
      nextCalled,
      true,
      `Must fall through to next() for traversal url: ${attackUrl}`
    );
    assert.equal(res.status, 404);
  }
});

test("onRequest: rejects paths outside allowed content roots without calling ASSETS.fetch", async () => {
  const restrictedPaths = [
    "https://aifocus.blog/",
    "https://aifocus.blog/posts/",
    "https://aifocus.blog/POSTS/",
    "https://aifocus.blog/CSS/",
    "https://aifocus.blog/Images/",
    "https://aifocus.blog/authors/paulkinlan/",
    "https://aifocus.blog/images/logo.png",
    "https://aifocus.blog/images/logo",
    "https://aifocus.blog/data/drops.tsv",
    "https://aifocus.blog/_headers",
    "https://aifocus.blog/.git/config",
    "https://aifocus.blog/foo/bar/baz",
  ];

  for (const url of restrictedPaths) {
    let assetFetchCalled = false;
    const fakeEnv = {
      ASSETS: {
        fetch: async () => {
          assetFetchCalled = true;
          return new Response("asset", { status: 200 });
        },
      },
    };

    let nextCalled = false;
    const req = new Request(url, {
      headers: { Accept: "text/markdown" },
    });

    const context = {
      request: req,
      next: async () => {
        nextCalled = true;
        return new Response("<html>Next response</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      },
      env: fakeEnv,
    };

    const res = await onRequest(context);
    assert.equal(
      assetFetchCalled,
      false,
      `ASSETS.fetch must not be called for restricted root: ${url}`
    );
    assert.equal(nextCalled, true);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Vary"), "Accept");
  }
});

test("onRequest: falls through to next() when markdown asset is not found (404)", async () => {
  const fakeEnv = {
    ASSETS: {
      fetch: async () => {
        return new Response("Not found", { status: 404, statusText: "Not Found" });
      },
    },
  };

  let nextCalled = false;
  const req = new Request("https://aifocus.blog/nonexistent-post/", {
    headers: { Accept: "text/markdown" },
  });

  const context = {
    request: req,
    next: async () => {
      nextCalled = true;
      return new Response("<html>404 Not Found</html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    },
    env: fakeEnv,
  };

  const res = await onRequest(context);
  assert.equal(nextCalled, true);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Vary"), "Accept");
});

test("onRequest: serves direct .md requests with decoration when safe", async () => {
  const req = new Request("https://aifocus.blog/sandbox-summary.md");
  const context = {
    request: req,
    next: async () => {
      return new Response("# Sandbox Summary\nContent here", {
        status: 200,
        headers: { "Content-Type": "text/markdown" },
      });
    },
    env: {},
  };

  const res = await onRequest(context);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.ok(res.headers.has("x-markdown-tokens"));
  assert.equal(res.headers.get("Vary"), "Accept");
});

test("onRequest: does not decorate unsafe direct .md requests", async () => {
  const req = new Request("https://aifocus.blog/..%2f_headers.md");
  const context = {
    request: req,
    next: async () => {
      return new Response("not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    },
    env: {},
  };

  const res = await onRequest(context);
  assert.equal(res.status, 404);
  assert.equal(res.headers.has("x-markdown-tokens"), false);
});
