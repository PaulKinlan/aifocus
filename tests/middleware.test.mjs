import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  onRequest,
  isUnsafePath,
  normalizePath,
  isValidContentPath,
  markdownSiblingPath,
  prefersMarkdown,
  estimateTokens,
  isValidLatestPostPath,
  RESERVED_ROOTS,
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
  assert.equal(isValidContentPath("/account/"), false);
  assert.equal(isValidContentPath("/account"), false);
  assert.equal(isValidContentPath("/stats/"), false);
  assert.equal(isValidContentPath("/stats"), false);

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
    "https://aifocus.blog/account/",
    "https://aifocus.blog/account",
    "https://aifocus.blog/stats/",
    "https://aifocus.blog/stats",
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

test("isValidLatestPostPath: accepts post permalinks but not other destinations", () => {
  for (const path of ["/model-half-life/", "/posts/model-half-life/"]) {
    assert.equal(isValidLatestPostPath(path), true, path);
  }
  for (const path of ["", "/", "//evil.example/", "https://evil.example/post/", "/posts/", "/training/intro/", "/images/", "/post?x=1", "/post/#fragment", "/%2f%2fevil/", "/post/\nLocation: https://evil.example/"]) {
    assert.equal(isValidLatestPostPath(path), false, path);
  }
});

test("onRequest: redirects only GET/HEAD root to the Hugo-built latest post", async () => {
  for (const method of ["GET", "HEAD"]) {
    const fetched = [];
    let nextCalled = false;
    const response = await onRequest({
      request: new Request("https://preview.pages.dev/?campaign=launch", { method, headers: { Accept: "text/markdown" } }),
      env: { ASSETS: { fetch: async (request) => {
        fetched.push([request.method, request.url]);
        return new Response("/latest-essay/");
      } } },
      next: async () => { nextCalled = true; return new Response("homepage"); },
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "https://preview.pages.dev/latest-essay/?campaign=launch");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(await response.text(), "");
    assert.deepEqual(fetched, [["GET", "https://preview.pages.dev/latest-post.txt"]]);
    assert.equal(nextCalled, false);
  }
});

test("onRequest: leaves homepage intact when latest post target is missing or invalid", async () => {
  for (const asset of [new Response("", { status: 200 }), new Response("https://evil.example/", { status: 200 }), new Response("missing", { status: 404 }), new Error("asset failure")]) {
    let nextCalled = false;
    const response = await onRequest({
      request: new Request("https://preview.pages.dev/"),
      env: { ASSETS: { fetch: async () => {
        if (asset instanceof Error) throw asset;
        return asset;
      } } },
      next: async () => { nextCalled = true; return new Response("homepage"); },
    });
    assert.equal(await response.text(), "homepage");
    assert.equal(response.status, 200);
    assert.equal(nextCalled, true);
  }
});

test("onRequest: leaves other methods and routes, including feed, JSON, archive and markdown, untouched", async () => {
  for (const [path, method] of [["/", "POST"], ["/index.xml", "GET"], ["/index.json", "GET"], ["/posts/", "GET"], ["/older-essay/", "GET"], ["/older-essay/index.md", "GET"]]) {
    let assetCalled = false;
    const response = await onRequest({
      request: new Request(`https://preview.pages.dev${path}`, { method }),
      env: { ASSETS: { fetch: async () => { assetCalled = true; return new Response("/latest-essay/"); } } },
      next: async () => new Response("existing route"),
    });
    assert.equal(response.status, 200, `${method} ${path}`);
    assert.equal(await response.text(), "existing route", `${method} ${path}`);
    assert.equal(assetCalled, false, `${method} ${path}`);
  }
});

test("onRequest: negotiation drives reserved behavior for /account and /stats while normal content negotiates markdown", async () => {
  const cases = [
    {
      path: "/account/",
      isReserved: true,
      htmlBody: "<html>Account Page</html>",
    },
    {
      path: "/stats/",
      isReserved: true,
      htmlBody: "<html>Stats Page</html>",
    },
    {
      path: "/model-half-life/",
      isReserved: false,
      markdownBody: "# Model Half-Life\nSome markdown text",
      htmlBody: "<html>Post Page</html>",
    },
  ];

  for (const c of cases) {
    let assetFetchCalled = false;
    let fetchedPath = null;
    let nextCalled = false;

    const fakeEnv = {
      ASSETS: {
        fetch: async (req) => {
          assetFetchCalled = true;
          fetchedPath = new URL(req.url).pathname;
          if (c.markdownBody) {
            return new Response(c.markdownBody, {
              status: 200,
              headers: { "Content-Type": "text/markdown" },
            });
          }
          return new Response("Not found", { status: 404 });
        },
      },
    };

    const req = new Request("https://aifocus.blog" + c.path, {
      headers: { Accept: "text/markdown" },
    });

    const context = {
      request: req,
      next: async () => {
        nextCalled = true;
        return new Response(c.htmlBody, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      },
      env: fakeEnv,
    };

    const res = await onRequest(context);

    if (c.isReserved) {
      // Reserved roots must take reserved behaviour: bypass negotiation,
      // never call ASSETS.fetch, and delegate straight to next() HTML.
      assert.equal(assetFetchCalled, false, `ASSETS.fetch must not be called for reserved route: ${c.path}`);
      assert.equal(nextCalled, true, `next() must be called for reserved route: ${c.path}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "text/html");
      assert.equal(res.headers.get("Vary"), "Accept");
      assert.equal(await res.text(), c.htmlBody);
    } else {
      // Normal content route negotiates markdown: fetches markdown asset,
      // decorates with tokens, does not call next().
      assert.equal(assetFetchCalled, true, `ASSETS.fetch must be called for content route: ${c.path}`);
      assert.equal(fetchedPath, "/model-half-life/index.md");
      assert.equal(nextCalled, false, `next() must not be called for content route: ${c.path}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "text/markdown; charset=utf-8");
      assert.equal(res.headers.get("Vary"), "Accept");
      assert.ok(res.headers.has("x-markdown-tokens"));
      const body = await res.text();
      assert.match(body, /# Model Half-Life/);
    }
  }
});

test("RESERVED_ROOTS: covers every reserved route across content, static, functions, and output", () => {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  // 1. Content utility pages: every top-level .md in content/
  const contentDir = path.join(rootDir, "content");
  if (fs.existsSync(contentDir)) {
    for (const ent of fs.readdirSync(contentDir, { withFileTypes: true })) {
      if (ent.isFile() && ent.name.endsWith(".md") && !ent.name.startsWith("_")) {
        const slug = ent.name.replace(/\.md$/, "");
        assert.ok(
          RESERVED_ROOTS.has(slug),
          `RESERVED_ROOTS must include content page slug: ${slug} (from content/${ent.name})`
        );
        assert.equal(isValidContentPath(`/${slug}/`), false, `/${slug}/ must not be a valid content path`);
        assert.equal(isValidContentPath(`/${slug}`), false, `/${slug} must not be a valid content path`);
      } else if (ent.isDirectory() && ent.name !== "posts" && !ent.name.startsWith("_") && !ent.name.startsWith(".")) {
        // Any non-post top-level directory in content (e.g. authors)
        assert.ok(
          RESERVED_ROOTS.has(ent.name),
          `RESERVED_ROOTS must include content section: ${ent.name} (from content/${ent.name})`
        );
        assert.equal(isValidContentPath(`/${ent.name}/`), false, `/${ent.name}/ must not be a valid content path`);
      }
    }
  }

  // 2. Static asset directories: every top-level directory in static/
  const staticDir = path.join(rootDir, "static");
  if (fs.existsSync(staticDir)) {
    for (const ent of fs.readdirSync(staticDir, { withFileTypes: true })) {
      if (ent.isDirectory() && !ent.name.startsWith(".") && !ent.name.startsWith("_")) {
        assert.ok(
          RESERVED_ROOTS.has(ent.name),
          `RESERVED_ROOTS must include static directory: ${ent.name} (from static/${ent.name})`
        );
        assert.equal(isValidContentPath(`/${ent.name}/`), false, `/${ent.name}/ must not be a valid content path`);
      }
    }
  }

  // 3. Functions routes: every top-level directory in functions/ (excluding private _lib)
  const functionsDir = path.join(rootDir, "functions");
  if (fs.existsSync(functionsDir)) {
    for (const ent of fs.readdirSync(functionsDir, { withFileTypes: true })) {
      if (ent.isDirectory() && !ent.name.startsWith("_") && !ent.name.startsWith(".")) {
        assert.ok(
          RESERVED_ROOTS.has(ent.name),
          `RESERVED_ROOTS must include function route directory: ${ent.name} (from functions/${ent.name})`
        );
        assert.equal(isValidContentPath(`/${ent.name}/`), false, `/${ent.name}/ must not be a valid content path`);
      }
    }
  }

  // 4. Built output (if public/ exists from a build): every non-post top-level directory
  const publicDir = path.join(rootDir, "public");
  if (fs.existsSync(publicDir)) {
    for (const ent of fs.readdirSync(publicDir, { withFileTypes: true })) {
      if (ent.isDirectory() && !ent.name.startsWith(".") && !ent.name.startsWith("_")) {
        const hasIndexMd = fs.existsSync(path.join(publicDir, ent.name, "index.md"));
        // If it does not have index.md, it is not a markdown-negotiable post page
        if (!hasIndexMd) {
          assert.ok(
            RESERVED_ROOTS.has(ent.name),
            `RESERVED_ROOTS must include non-post built directory: ${ent.name} (from public/${ent.name})`
          );
          assert.equal(isValidContentPath(`/${ent.name}/`), false, `/${ent.name}/ must not be a valid content path`);
        }
      }
    }
  }
});
