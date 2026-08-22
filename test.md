  curl https://graham-subscribe-equity-transmit.trycloudflare.com/api/chat \
    -H 'Content-Type: application/json' \
    -d '{
      "provider": "vllm",
      "messages": [{"role":"user","content":"Hello"}],
      "max_tokens": 1024
    }'