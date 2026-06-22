# ADR 0009 — Local-first LLM via an OpenAI-compatible abstraction

- **Status:** Accepted
- **Date:** 2026-06-22

## Context
The smart layer (receipt extraction) must be able to run fully on-prem in the final product for data
sovereignty, while staying easy to develop against.

## Decision
All model access goes through one internal interface speaking the **OpenAI-compatible** wire format.
The default backend is a **local** model — **Qwen2.5-VL** served by **Ollama** (dev) or **vLLM**
(prod). A hosted endpoint is just a different base URL for benchmarking. OCR fallback is **Surya/
docTR**. Observability via self-hosted **Langfuse**. All output is propose-only (ADR 0002).

## Consequences
- The shipped product can run with zero external LLM calls.
- Model choice is a config change, not a code change.
- **Accepted cost:** a local vision model needs a GPU; users can run hosted by default and flip to
  local, with a documented self-host path.

## Alternatives considered
- Hosted-only (Anthropic/OpenAI) — rejected as the default for sovereignty.
- Building two separate extraction backends — rejected: the abstraction gives one code path.
