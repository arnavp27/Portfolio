---
title: 'OncoEdge'
category: 'Computer vision · Edge AI research'
summary: 'An end-to-end vision research project: locate regions, compare biomedical image features, and make the model’s uncertainty visible.'
order: 3
year: '2026'
status: 'Live research demo'
role: 'Built the project end to end'
tags: ['YOLO', 'BioMedCLIP', 'ONNX']
scene: 'onco'
links:
  - label: 'Explore the demo'
    url: 'https://oncoedge.duckdns.org/'
  - label: 'Source on GitHub'
    url: 'https://github.com/arnavp27/OncoEdge-Jetson'
---

## From model to working application

I built OncoEdge as an oral-lesion imaging research project, combining a fine-tuned YOLO detector with BioMedCLIP image comparisons. The public demo runs on a CPU and exposes region overlays, relative scores, model disagreement, and structured results.

## Working within constraints

The edge-deployment work explores fixed-text embedding caching, a vision-only ONNX export, and TensorRT tooling for a smaller inference path. Jetson latency and final TensorRT engine size remain unverified; the hosted demo demonstrates the CPU implementation.

## Making uncertainty visible

The engineering work includes evaluation, image-preprocessing checks, and explicit abstention handling. These details matter when several models are combined and their outputs can disagree.

This is a research demonstration, not a clinical diagnostic tool. The demo and repository document its limitations.
