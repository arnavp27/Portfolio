---
title: 'Pixel GPT'
category: 'Generative models · From scratch'
summary: 'Draw half a tiny image. Let a transformer finish the thought. A hands-on comparison of image models I trained from scratch.'
order: 2
year: '2026'
status: 'Live playground'
role: 'Built and trained the models and playground'
tags: ['PyTorch', 'Transformers', 'Streamlit']
scene: 'pixel'
links:
  - label: 'Try the playground'
    url: 'https://pixel-gpt-arnav.streamlit.app/'
  - label: 'Source on GitHub'
    url: 'https://github.com/arnavp27/pixel-gpt'
---

## Learning by building the model

Pixel GPT explores image generation at a scale where you can still see what’s happening. I trained the models from scratch and built a playground to compare them.

## A few pixels, three approaches

Draw half of an 8 × 8 sprite, then compare a bigram model, an MLP, and a small transformer completing the rest. The same input makes their different behaviour easy to see. Temperature and seed controls let you experiment and repeat a result.

## From sprites to faces

A separate transformer completes the missing half of a 64 × 64 grayscale face. You can compare the generated result with a mirrored baseline and the original image.

The repository includes the training code, saved evaluation results, and the Streamlit application. These are deliberately small experiments in learning structure, rather than a general-purpose image generator.
