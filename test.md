  curl https://volleyball-availability-commodities-drinking.trycloudflare.com/api/chat \
    -H 'Content-Type: application/json' \
    -d '{
      "provider": "vllm",
      "messages": [{"role":"user","content":"Hello"}],
      "max_tokens": 1024
    }'