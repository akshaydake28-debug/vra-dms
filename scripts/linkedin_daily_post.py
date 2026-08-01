#!/usr/bin/env python3
"""Generates one LinkedIn post (AI caption + AI image) and publishes it.

Run daily by .github/workflows/linkedin-daily-post.yml. See
docs/LINKEDIN_AUTOMATION_SETUP.md for the one-time account setup this
script depends on.

Required environment variables:
  LINKEDIN_ACCESS_TOKEN - LinkedIn OAuth access token (scopes: openid,
                           profile, w_member_social)
  GEMINI_API_KEY         - Google AI Studio API key (free tier)
"""
import datetime
import os
import sys
import urllib.parse

import requests

LINKEDIN_TOKEN = os.environ["LINKEDIN_ACCESS_TOKEN"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

LINKEDIN_VERSION = "202405"
TOPICS_FILE = os.path.join(os.path.dirname(__file__), "..", "content", "topics.txt")


def load_topic():
    with open(TOPICS_FILE) as f:
        topics = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    if not topics:
        raise SystemExit("content/topics.txt has no topics")
    day_index = datetime.date.today().timetuple().tm_yday
    return topics[day_index % len(topics)]


def generate_caption(topic):
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    )
    prompt = (
        "Write a short, engaging LinkedIn post (120-180 words) about: "
        f"{topic}. Professional but conversational tone. At most 2 "
        "emojis. End with at most 3 relevant hashtags on their own line. "
        "Return only the post text, nothing else."
    )
    resp = requests.post(
        url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=30
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def generate_image(topic):
    prompt = f"professional, clean, modern illustration representing: {topic}"
    encoded = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded}?width=1200&height=1200&nologo=true"
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def get_person_urn():
    resp = requests.get(
        "https://api.linkedin.com/v2/userinfo",
        headers={"Authorization": f"Bearer {LINKEDIN_TOKEN}"},
        timeout=30,
    )
    resp.raise_for_status()
    return f"urn:li:person:{resp.json()['sub']}"


def upload_image(person_urn, image_bytes):
    init_resp = requests.post(
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        headers={
            "Authorization": f"Bearer {LINKEDIN_TOKEN}",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        },
        json={"initializeUploadRequest": {"owner": person_urn}},
        timeout=30,
    )
    init_resp.raise_for_status()
    value = init_resp.json()["value"]

    put_resp = requests.put(
        value["uploadUrl"],
        data=image_bytes,
        headers={"Authorization": f"Bearer {LINKEDIN_TOKEN}"},
        timeout=60,
    )
    put_resp.raise_for_status()
    return value["image"]


def publish_post(person_urn, caption, image_urn, topic):
    body = {
        "author": person_urn,
        "commentary": caption,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "content": {"media": {"title": topic[:200], "id": image_urn}},
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    resp = requests.post(
        "https://api.linkedin.com/rest/posts",
        headers={
            "Authorization": f"Bearer {LINKEDIN_TOKEN}",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id")


def main():
    topic = load_topic()
    print(f"Topic: {topic}")
    caption = generate_caption(topic)
    print(f"Caption:\n{caption}\n")
    image_bytes = generate_image(topic)
    print(f"Image generated: {len(image_bytes)} bytes")
    person_urn = get_person_urn()
    image_urn = upload_image(person_urn, image_bytes)
    print(f"Uploaded image URN: {image_urn}")
    post_id = publish_post(person_urn, caption, image_urn, topic)
    print(f"Published post: {post_id}")


if __name__ == "__main__":
    try:
        main()
    except requests.HTTPError as e:
        body = e.response.text if e.response is not None else ""
        print(f"HTTP error: {e} - {body}", file=sys.stderr)
        raise
