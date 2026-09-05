FROM node:24-bookworm-slim AS node
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates libportaudio2 libgles2 fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/portrait-motion/requirements.txt /tmp/motion-requirements.txt
RUN python3 -m venv /opt/motion && /opt/motion/bin/pip install --no-cache-dir -r /tmp/motion-requirements.txt && /opt/motion/bin/pip install --no-cache-dir --no-deps mediapipe==0.10.33
RUN npm install --no-save --package-lock=false playwright@1.58.2 && npx playwright install --with-deps chromium
ENV MOTION_PYTHON=/opt/motion/bin/python ROLE_REPLAY_YOUTH=1 ROLE_ALLOW_PAID=0 ROLE_OUTPUT_DIR=/out PYTHONUTF8=1
CMD ["node", "--experimental-strip-types", "scripts/role-resources.ts", "submit", "AI_output/normalized/青年-cf1a11df052a/source.png"]
