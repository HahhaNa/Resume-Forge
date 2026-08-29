/**
 * The one build setting this project has, and it exists for one reason.
 *
 * The model clients in `lib/llm.ts` run in the browser with the user's own key
 * — that is the whole design, and it is what keeps this app serverless. But
 * the provider SDKs are written for Node first, and their credential loaders
 * reach for `node:path` and `node:fs` to find a key on disk before falling back
 * to the one you passed in. That code can never run here: there is no disk, and
 * the key is handed over explicitly. Webpack, though, refuses the `node:`
 * scheme outright while bundling for the browser, before it ever gets to notice
 * the branch is dead.
 *
 * So the scheme is stripped and the bare builtins resolve to nothing, which
 * leaves the credential chain with no file to read and the explicit key it was
 * given. Client bundle only — the server build keeps the real modules.
 *
 * @type {import('next').NextConfig}
 */
export default {
  reactStrictMode: true,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => {
          r.request = r.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        child_process: false,
        worker_threads: false,
        async_hooks: false,
        http: false,
        https: false,
        net: false,
        tls: false,
        zlib: false,
      };
    }
    return config;
  },
};
