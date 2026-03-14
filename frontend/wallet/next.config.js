/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config, { isServer }) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            net: false,
            tls: false,
            readline: false,
            path: false,
            os: false,
            stream: false,
            constants: false,
            worker_threads: false,
        };

        // Enable WASM for snarkjs / circomlibjs
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
            layers: true,
        };

        // snarkjs imports .wasm files — tell webpack to treat them as assets
        config.module.rules.push({
            test: /\.wasm$/,
            type: 'webassembly/async',
        });

        // Suppress warnings from snarkjs / ffjavascript dynamic requires
        config.module.rules.push({
            test: /\.js$/,
            include: /node_modules\/(snarkjs|ffjavascript|circomlibjs)/,
            resolve: {
                fullySpecified: false,
            },
        });

        return config;
    },
    // Allow large WASM artifacts
    experimental: {
        serverComponentsExternalPackages: ['snarkjs'],
    },
};

module.exports = nextConfig;
