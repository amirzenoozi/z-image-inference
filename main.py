import io
import base64
import random
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

import requests
import gradio as gr
from PIL import Image

from grok_client import GrokClient

DB_PATH = Path(__file__).parent / "history.db"
MODEL_SERVER_URL = "http://127.0.0.1:8000"

history_detail = []  # for history tab: [(image, prompt, seed, width, height, steps), ...]
grok_client = GrokClient()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_data BLOB NOT NULL,
            prompt TEXT,
            seed INTEGER,
            width INTEGER,
            height INTEGER,
            steps INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def load_history():
    global history_detail
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT image_data, prompt, seed, width, height, steps FROM images ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    history_detail = []
    for row in rows:
        img = Image.open(io.BytesIO(row[0]))
        history_detail.append({
            "image": img,
            "prompt": row[1] or "",
            "seed": row[2],
            "width": row[3],
            "height": row[4],
            "steps": row[5],
        })


def save_to_db(image, prompt, seed, width, height, steps):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    image_data = buffer.getvalue()

    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO images (image_data, prompt, seed, width, height, steps) VALUES (?, ?, ?, ?, ?, ?)",
        (image_data, prompt, seed, width, height, steps)
    )
    conn.commit()
    conn.close()


def delete_from_db_by_index(index: int):
    """Delete one image by its position in history_detail."""
    global history_detail
    if index < 0 or index >= len(history_detail):
        return False

    conn = sqlite3.connect(DB_PATH)
    # history_detail uses the same created_at DESC order
    rows = conn.execute("SELECT id FROM images ORDER BY created_at DESC").fetchall()
    if index < len(rows):
        image_id = rows[index][0]
        conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
        conn.commit()
    conn.close()

    history_detail.pop(index)
    return True


def clear_all_history():
    global history_detail
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM images")
    conn.commit()
    conn.close()
    history_detail = []


RESOLUTION_OPTIONS = {
    "512": {
        "512x512 (1:1)": (512, 512),
        "640x384 (5:3)": (640, 384),
        "384x640 (3:5)": (384, 640),
        "512x384 (4:3)": (512, 384),
        "384x512 (3:4)": (384, 512),
        "640x368 (16:9)": (640, 368),
        "368x640 (9:16)": (368, 640),
    },
    "768": {
        "768x768 (1:1)": (768, 768),
        "960x576 (5:3)": (960, 576),
        "576x960 (3:5)": (576, 960),
        "768x576 (4:3)": (768, 576),
        "576x768 (3:4)": (576, 768),
        "960x544 (16:9)": (960, 544),
        "544x960 (9:16)": (544, 960),
    },
    "1024": {
        "1024x1024 (1:1)": (1024, 1024),
        "1280x768 (5:3)": (1280, 768),
        "768x1280 (3:5)": (768, 1280),
        "1024x768 (4:3)": (1024, 768),
        "768x1024 (3:4)": (768, 1024),
        "1280x720 (16:9)": (1280, 720),
        "720x1280 (9:16)": (720, 1280),
        "1024x576 (16:9)": (1024, 576),
        "576x1024 (9:16)": (576, 1024),
    },
    "1280": {
        "1280x1280 (1:1)": (1280, 1280),
        "1536x1024 (3:2)": (1536, 1024),
        "1024x1536 (2:3)": (1024, 1536),
        "1536x864 (16:9)": (1536, 864),
        "864x1536 (9:16)": (864, 1536),
    },
}

EXAMPLE_PROMPTS = [
    "A man and his poodle wearing matching outfits at a dog show, indoor lighting, an audience in the background.",
    "Moody, low-key portrait of an elegant Chinese woman in a dark room. A strong beam of light passes through a gobo and casts a sharp lightning-bolt-shaped shadow across her face, lighting exactly one eye. High contrast, crisp light-to-shadow transition, mysterious atmosphere, Leica colour tones.",
    "A medium-shot phone selfie of a young East Asian woman with long black hair taking a mirror selfie in a brightly lit elevator. She wears a black off-the-shoulder crop top with a white floral pattern and dark jeans. Her head is tilted slightly and her lips are pursed in a playful kiss, very cute. She holds a dark grey smartphone in her right hand, partly covering her face, with the rear camera facing the mirror.",
    "Young Chinese woman in red Hanfu, intricate embroidery. Impeccable makeup, red floral forehead pattern. Elaborate high bun, golden phoenix headdress, red flowers, beads. Holds round folding fan with lady, trees, bird. Neon lightning-bolt lamp (⚡️), bright yellow glow, above extended left palm. Soft-lit outdoor night background, silhouetted tiered pagoda (Xi'an Giant Wild Goose Pagoda), blurred colorful distant lights.",
    """
    A vertical digital illustration depicting a serene and majestic Chinese landscape, rendered in a style reminiscent of traditional Shanshui painting but with a modern, clean aesthetic. The scene is dominated by towering, steep cliffs in various shades of blue and teal, which frame a central valley. In the distance, layers of mountains fade into a light blue and white mist, creating a strong sense of atmospheric perspective and depth. A calm, turquoise river flows through the center of the composition, with a small, traditional Chinese boat, possibly a sampan, navigating its waters. The boat has a bright yellow canopy and a red hull, and it leaves a gentle wake behind it. It carries several indistinct figures of people. Sparse vegetation, including green trees and some bare-branched trees, clings to the rocky ledges and peaks. The overall lighting is soft and diffused, casting a tranquil glow over the entire scene. Centered in the image is overlaid text. At the top of the text block is a small, red, circular seal-like logo containing stylized characters. Below it, in a smaller, black, sans-serif font, are the words 'Zao-Xiang * East Beauty & West Fashion * Z-Image'. Directly beneath this, in a larger, elegant black serif font, is the word 'SHOW & SHARE CREATIVITY WITH THE WORLD'. Among them, there are "SHOW & SHARE", "CREATIVITY", and "WITH THE WORLD"
    """,
]


def update_resolution_choices(category):
    choices = list(RESOLUTION_OPTIONS.get(category, {}).keys())
    return gr.update(choices=choices, value=choices[0] if choices else None)


def generate_image_internal(prompt, res_category, resolution, seed, random_seed, steps):
    if random_seed:
        seed = random.randint(0, 2147483647)
    else:
        seed = int(seed)

    width, height = RESOLUTION_OPTIONS.get(res_category, {}).get(resolution, (1024, 1024))

    try:
        resp = requests.post(
            f"{MODEL_SERVER_URL}/generate",
            json={
                "prompt": prompt,
                "width": width,
                "height": height,
                "steps": int(steps),
                "seed": seed,
            },
            timeout=300,
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise gr.Error("Model server not started. Please run: uv run python model_server.py")
    except requests.exceptions.RequestException as e:
        raise gr.Error(f"Request failed: {e}")

    data = resp.json()
    image_bytes = base64.b64decode(data["image_base64"])
    image = Image.open(io.BytesIO(image_bytes))

    save_to_db(image, prompt, seed, width, height, int(steps))

    history_detail.insert(0, {
        "image": image,
        "prompt": prompt,
        "seed": seed,
        "width": width,
        "height": height,
        "steps": int(steps),
    })

    return image, str(seed)


def chat_and_generate(user_message, chat_history, res_category, resolution, seed, random_seed, steps):
    """Stream the Grok-written prompt, then generate the image from it."""
    if not user_message.strip():
        yield chat_history, None, "", user_message
        return

    if chat_history is None:
        chat_history = []

    chat_history.append({"role": "user", "content": user_message})
    chat_history.append({"role": "assistant", "content": ""})

    generated_prompt = ""
    try:
        for chunk in grok_client.chat_stream(user_message):
            generated_prompt += chunk
            chat_history[-1]["content"] = generated_prompt
            yield chat_history, None, "Generating prompt...", ""
    except Exception as e:
        chat_history[-1]["content"] = f"Grok API error: {e}"
        yield chat_history, None, "", ""
        return

    yield chat_history, None, "Generating image...", ""

    try:
        image, seed_used = generate_image_internal(
            generated_prompt, res_category, resolution, seed, random_seed, steps
        )
    except gr.Error as e:
        yield chat_history, None, str(e), ""
        return

    yield chat_history, image, seed_used, ""


def clear_chat():
    grok_client.clear_history()
    return [], None, ""


def regenerate_after_edit(chat_history, res_category, resolution, seed, random_seed, steps):
    if not chat_history:
        yield chat_history, None, ""
        return

    last_user_idx = None
    for i in range(len(chat_history) - 1, -1, -1):
        if chat_history[i].get("role") == "user":
            last_user_idx = i
            break

    if last_user_idx is None:
        yield chat_history, None, ""
        return

    user_message = chat_history[last_user_idx]["content"]

    chat_history.append({"role": "assistant", "content": ""})

    generated_prompt = ""
    try:
        for chunk in grok_client.chat_stream(user_message):
            generated_prompt += chunk
            chat_history[-1]["content"] = generated_prompt
            yield chat_history, None, "Generating prompt..."
    except Exception as e:
        chat_history[-1]["content"] = f"Grok API error: {e}"
        yield chat_history, None, ""
        return

    yield chat_history, None, "Generating image..."

    try:
        image, seed_used = generate_image_internal(
            generated_prompt, res_category, resolution, seed, random_seed, steps
        )
    except gr.Error as e:
        yield chat_history, None, str(e)
        return

    yield chat_history, image, seed_used


def direct_generate(prompt, res_category, resolution, seed, random_seed, steps):
    if not prompt.strip():
        return None, ""

    try:
        image, seed_used = generate_image_internal(
            prompt, res_category, resolution, seed, random_seed, steps
        )
        return image, seed_used
    except gr.Error as e:
        raise e


def fill_example(example_text):
    return example_text


def get_history_gallery():
    return [(d["image"], f"seed: {d['seed']}") for d in history_detail]


def on_history_select(evt: gr.SelectData):
    if evt.index < len(history_detail):
        item = history_detail[evt.index]
        info = f"Seed: {item['seed']}  |  {item['width']}x{item['height']}  |  Steps: {item['steps']}"
        return item["image"], item["prompt"], info, evt.index
    return None, "", "", -1


def on_delete_selected(selected_index: int):
    if selected_index < 0:
        gr.Warning("Please select an image to delete first")
        return get_history_gallery(), None, "", "", -1

    if delete_from_db_by_index(selected_index):
        gr.Info("Image deleted")
    return get_history_gallery(), None, "", "", -1


def on_clear_all_history():
    clear_all_history()
    gr.Info("All history cleared")
    return get_history_gallery(), None, "", "", -1


with gr.Blocks(title="Z-Image-Turbo") as demo:
    gr.HTML("""
    <style>
    /* Gradio 6.x chatbot bubbles: full width */
    .bubble-wrap .message-row.bubble {
        max-width: 100% !important;
    }
    .bubble-wrap .message {
        max-width: 100% !important;
    }
    .bubble-wrap .flex-wrap {
        max-width: 100% !important;
    }
    /* Hide the history gallery selection highlight */
    .history-gallery .thumbnail-item.selected {
        border-color: transparent !important;
        outline: none !important;
    }
    .history-gallery .thumbnail-item:focus {
        outline: none !important;
    }
    </style>
    """)

    gr.Markdown("# Z-Image-Turbo")

    gr.Markdown("*An Efficient Image Generation Foundation Model with Single-Stream Diffusion Transformer*")

    with gr.Tabs():
        with gr.TabItem("Generate"):
            with gr.Row():
                with gr.Column(scale=1):
                    with gr.Tabs(selected="direct_tab" if not grok_client.available else "chat_tab") as input_tabs:
                        with gr.TabItem(
                            "Chat Mode" if grok_client.available else "Chat Mode (API Key not configured)",
                            id="chat_tab",
                            interactive=grok_client.available,
                        ):
                            chatbot = gr.Chatbot(
                                label="Chat (double-click user message to edit)",
                                height=300,
                                editable="user",
                                layout="panel",
                            )
                            user_input = gr.Textbox(
                                placeholder="Describe the image you want...",
                                lines=2,
                                show_label=False,
                            )
                            with gr.Row():
                                send_btn = gr.Button("Send", variant="primary", scale=1)
                                clear_btn = gr.Button("Clear Chat", scale=1)

                        with gr.TabItem("Direct Input Prompt", id="direct_tab"):
                            direct_prompt = gr.Textbox(
                                label="Prompt",
                                placeholder="Enter complete image generation prompt...",
                                lines=10,
                            )
                            direct_generate_btn = gr.Button("Generate Image", variant="primary")

                    with gr.Row():
                        res_category = gr.Dropdown(
                            label="Resolution Category",
                            choices=["512", "768", "1024", "1280"],
                            value="512",
                        )
                        resolution = gr.Dropdown(
                            label="Resolution",
                            choices=list(RESOLUTION_OPTIONS["512"].keys()),
                            value="368x640 (9:16)",
                        )

                    with gr.Row():
                        seed_input = gr.Number(label="Seed", value=-1)
                        random_seed = gr.Checkbox(label="Random Seed", value=True)

                    steps = gr.Slider(
                        minimum=1,
                        maximum=20,
                        value=8,
                        step=1,
                        label="Steps",
                    )

                    gr.Markdown("### Examples (click to fill input)")
                    example_buttons = []
                    with gr.Row():
                        for i, example in enumerate(EXAMPLE_PROMPTS):
                            short_label = example[:20] + "..." if len(example) > 20 else example
                            btn = gr.Button(short_label, size="sm")
                            example_buttons.append((btn, example))

                with gr.Column(scale=1):
                    output_image = gr.Image(label="Generated Image", type="pil")
                    seed_used = gr.Textbox(label="Seed Used", interactive=False)

        with gr.TabItem("History") as history_tab:
            with gr.Row():
                clear_all_btn = gr.Button("Clear All History", variant="stop", size="sm")
            with gr.Row():
                with gr.Column(scale=1):
                    history_gallery = gr.Gallery(label="History", columns=3, height=400, preview=False, allow_preview=False)
                with gr.Column(scale=1):
                    preview_image = gr.Image(label="Preview", type="pil")
                    preview_info = gr.Textbox(label="Info", interactive=False)
                    preview_prompt = gr.Textbox(label="Prompt", lines=5, interactive=False)
                    delete_btn = gr.Button("Delete This Image", variant="secondary")
                    selected_index = gr.State(value=-1)

    for btn, example in example_buttons:
        btn.click(fn=lambda e=example: (e, e), outputs=[user_input, direct_prompt])

    res_category.change(
        fn=update_resolution_choices,
        inputs=[res_category],
        outputs=[resolution],
    )

    send_btn.click(
        fn=chat_and_generate,
        inputs=[user_input, chatbot, res_category, resolution, seed_input, random_seed, steps],
        outputs=[chatbot, output_image, seed_used, user_input],
    )

    user_input.submit(
        fn=chat_and_generate,
        inputs=[user_input, chatbot, res_category, resolution, seed_input, random_seed, steps],
        outputs=[chatbot, output_image, seed_used, user_input],
    )

    clear_btn.click(
        fn=clear_chat,
        outputs=[chatbot, output_image, seed_used],
    )

    direct_generate_btn.click(
        fn=direct_generate,
        inputs=[direct_prompt, res_category, resolution, seed_input, random_seed, steps],
        outputs=[output_image, seed_used],
    )

    direct_prompt.submit(
        fn=direct_generate,
        inputs=[direct_prompt, res_category, resolution, seed_input, random_seed, steps],
        outputs=[output_image, seed_used],
    )

    def on_edit(chat_history, evt: gr.EditData):
        """Truncate the chat at the edited user message."""
        row_idx = evt.index[0] if isinstance(evt.index, (list, tuple)) else evt.index

        if row_idx >= len(chat_history) or chat_history[row_idx].get("role") != "user":
            return chat_history

        truncated = chat_history[:row_idx + 1]
        truncated[row_idx]["content"] = evt.value

        grok_client.history = grok_client.history[:row_idx]

        return truncated

    chatbot.edit(
        fn=on_edit,
        inputs=[chatbot],
        outputs=[chatbot],
    ).then(
        fn=regenerate_after_edit,
        inputs=[chatbot, res_category, resolution, seed_input, random_seed, steps],
        outputs=[chatbot, output_image, seed_used],
    )

    history_tab.select(fn=get_history_gallery, outputs=[history_gallery])

    history_gallery.select(
        fn=on_history_select,
        outputs=[preview_image, preview_prompt, preview_info, selected_index],
    )

    delete_btn.click(
        fn=on_delete_selected,
        inputs=[selected_index],
        outputs=[history_gallery, preview_image, preview_prompt, preview_info, selected_index],
    )

    clear_all_btn.click(
        fn=on_clear_all_history,
        outputs=[history_gallery, preview_image, preview_prompt, preview_info, selected_index],
    )

if __name__ == "__main__":
    init_db()
    load_history()
    demo.launch()
