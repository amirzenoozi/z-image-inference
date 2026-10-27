import io
import base64
import random
import textwrap
from collections.abc import Iterator
from dataclasses import dataclass

from dotenv import load_dotenv
load_dotenv()

import openai
import requests
import gradio as gr
from PIL import Image

import history_store
from grok_client import GrokClient
from model_catalog import DEFAULT_MODEL, MODELS, ModelSpec

MODEL_SERVER_URL = "http://127.0.0.1:8000"
# Long enough for a first-time model download or a switch between models
REQUEST_TIMEOUT = 900
MAX_SEED = 2**32 - 1
HISTORY_PAGE_SIZE = 30

CSS = """
.bubble-wrap .message-row.bubble,
.bubble-wrap .message,
.bubble-wrap .flex-wrap {
    max-width: 100% !important;
}
.history-gallery .thumbnail-item.selected {
    border-color: transparent !important;
    outline: none !important;
}
.history-gallery .thumbnail-item:focus {
    outline: none !important;
}
"""

grok_client = GrokClient()

RESOLUTIONS: dict[str, tuple[int, int]] = {
    "512x512 (1:1)": (512, 512),
    "640x384 (5:3)": (640, 384),
    "384x640 (3:5)": (384, 640),
    "512x384 (4:3)": (512, 384),
    "384x512 (3:4)": (384, 512),
    "640x368 (16:9)": (640, 368),
    "368x640 (9:16)": (368, 640),
    "768x768 (1:1)": (768, 768),
    "960x576 (5:3)": (960, 576),
    "576x960 (3:5)": (576, 960),
    "768x576 (4:3)": (768, 576),
    "576x768 (3:4)": (576, 768),
    "960x544 (16:9)": (960, 544),
    "544x960 (9:16)": (544, 960),
    "1024x1024 (1:1)": (1024, 1024),
    "1280x768 (5:3)": (1280, 768),
    "768x1280 (3:5)": (768, 1280),
    "1024x768 (4:3)": (1024, 768),
    "768x1024 (3:4)": (768, 1024),
    "1280x720 (16:9)": (1280, 720),
    "720x1280 (9:16)": (720, 1280),
    "1024x576 (16:9)": (1024, 576),
    "576x1024 (9:16)": (576, 1024),
    "1280x1280 (1:1)": (1280, 1280),
    "1536x1024 (3:2)": (1536, 1024),
    "1024x1536 (2:3)": (1024, 1536),
    "1536x864 (16:9)": (1536, 864),
    "864x1536 (9:16)": (864, 1536),
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

ChatMessage = dict[str, object]
ChatUpdate = tuple[list[ChatMessage], Image.Image | None, str]
GalleryItem = tuple[Image.Image, str]
Preview = tuple[Image.Image | None, str, str, int | None]
SettingValue = str | float | bool | None

EMPTY_PREVIEW: Preview = (None, "", "", None)


@dataclass(frozen=True)
class GenerationSettings:
    """Values of the settings controls, in the order of SettingsControls.as_inputs()."""

    model_id: str
    resolution: str
    seed: float | None
    random_seed: bool
    steps: float
    guidance: float
    negative_prompt: str


def resolutions_for(spec: ModelSpec) -> list[str]:
    return [label for label, (width, height) in RESOLUTIONS.items() if max(width, height) <= spec.max_side]


def resolve_seed(settings: GenerationSettings) -> int:
    if settings.random_seed or settings.seed is None:
        return random.randint(0, MAX_SEED)
    return int(settings.seed)


def post_generate(payload: dict[str, str | int | float]) -> dict[str, str | int]:
    try:
        resp = requests.post(f"{MODEL_SERVER_URL}/generate", json=payload, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise gr.Error("Model server not started. Please run: uv run python model_server.py")
    except requests.exceptions.RequestException as e:
        raise gr.Error(f"Request failed: {e}")
    return resp.json()


def request_image(prompt: str, settings: GenerationSettings) -> tuple[Image.Image, str]:
    seed = resolve_seed(settings)
    width, height = RESOLUTIONS[settings.resolution]
    steps = int(settings.steps)
    data = post_generate({
        "model": settings.model_id,
        "prompt": prompt,
        "negative_prompt": settings.negative_prompt,
        "width": width,
        "height": height,
        "steps": steps,
        "guidance": float(settings.guidance),
        "seed": seed,
    })
    image = Image.open(io.BytesIO(base64.b64decode(str(data["image_base64"]))))
    history_store.add(image, prompt, seed, width, height, steps, settings.model_id)
    return image, str(seed)


def direct_generate(prompt: str, *settings: SettingValue) -> tuple[Image.Image | None, str]:
    if not prompt.strip():
        return None, ""
    return request_image(prompt, GenerationSettings(*settings))


def message_text(message: ChatMessage) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    return ""


def prompt_then_image(chat_history: list[ChatMessage], settings: GenerationSettings) -> Iterator[ChatUpdate]:
    """Stream Grok's prompt for a chat that ends with a user message, then generate the image from it."""
    messages = [{"role": str(message["role"]), "content": message_text(message)} for message in chat_history]
    reply: ChatMessage = {"role": "assistant", "content": ""}
    chat_history = [*chat_history, reply]

    prompt = ""
    try:
        for chunk in grok_client.chat_stream(messages):
            prompt += chunk
            reply["content"] = prompt
            yield chat_history, None, "Generating prompt..."
    except (openai.OpenAIError, ValueError) as e:
        gr.Warning(f"Grok API error: {e}")
        yield chat_history[:-1], None, ""
        return

    yield chat_history, None, "Generating image..."
    image, seed = request_image(prompt, settings)
    yield chat_history, image, seed


def chat_and_generate(
    user_message: str, chat_history: list[ChatMessage] | None, *settings: SettingValue
) -> Iterator[tuple[list[ChatMessage], Image.Image | None, str, str]]:
    if not user_message.strip():
        yield chat_history or [], None, "", user_message
        return

    chat_history = [*(chat_history or []), {"role": "user", "content": user_message}]
    for chat, image, status in prompt_then_image(chat_history, GenerationSettings(*settings)):
        yield chat, image, status, ""


def truncate_at_edit(chat_history: list[ChatMessage], evt: gr.EditData) -> list[ChatMessage]:
    row = evt.index[0] if isinstance(evt.index, (list, tuple)) else evt.index
    if row >= len(chat_history) or chat_history[row].get("role") != "user":
        return chat_history

    truncated = chat_history[:row + 1]
    truncated[row]["content"] = evt.value
    return truncated


def regenerate_after_edit(chat_history: list[ChatMessage], *settings: SettingValue) -> Iterator[ChatUpdate]:
    if not chat_history or chat_history[-1].get("role") != "user":
        yield chat_history, None, ""
        return
    yield from prompt_then_image(chat_history, GenerationSettings(*settings))


def clear_chat() -> tuple[list[ChatMessage], None, str]:
    return [], None, ""


def reuse_seed(seed_used: str) -> tuple[int | dict, bool | dict]:
    if not seed_used.isdigit():
        return gr.skip(), gr.skip()
    return int(seed_used), False


def on_model_change(model_id: str) -> tuple[dict, dict, dict, dict]:
    spec = MODELS[model_id]
    return (
        gr.update(choices=resolutions_for(spec), value=spec.default_resolution),
        gr.update(value=spec.default_steps, maximum=spec.max_steps),
        gr.update(value=spec.default_guidance, visible=spec.uses_guidance),
        gr.update(value=spec.default_negative_prompt, visible=spec.uses_guidance),
    )


def history_page(count: int) -> tuple[list[GalleryItem], list[int]]:
    items = history_store.recent(count)
    return [(item.image, f"seed: {item.seed}") for item in items], [item.id for item in items]


def show_history() -> tuple[list[GalleryItem], list[int]]:
    return history_page(HISTORY_PAGE_SIZE)


def load_more_history(shown_ids: list[int]) -> tuple[list[GalleryItem], list[int]]:
    return history_page(len(shown_ids) + HISTORY_PAGE_SIZE)


def describe(item: history_store.HistoryItem) -> str:
    spec = MODELS.get(item.model)
    model = spec.label if spec else item.model
    return f"{model}  |  Seed: {item.seed}  |  {item.width}x{item.height}  |  Steps: {item.steps}"


def on_history_select(shown_ids: list[int], evt: gr.SelectData) -> Preview:
    item = history_store.get(shown_ids[evt.index]) if evt.index < len(shown_ids) else None
    if item is None:
        return EMPTY_PREVIEW
    return item.image, item.prompt, describe(item), item.id


def delete_selected(
    selected_id: int | None, shown_ids: list[int]
) -> tuple[list[GalleryItem], list[int], *Preview]:
    if selected_id is None:
        gr.Warning("Please select an image to delete first")
    else:
        history_store.delete(selected_id)
        gr.Info("Image deleted")
    return *history_page(max(len(shown_ids), HISTORY_PAGE_SIZE)), *EMPTY_PREVIEW


def clear_history() -> tuple[list[GalleryItem], list[int], *Preview]:
    history_store.clear()
    gr.Info("All history cleared")
    return [], [], *EMPTY_PREVIEW


@dataclass
class ChatControls:
    chatbot: gr.Chatbot
    message: gr.Textbox
    send: gr.Button
    clear: gr.Button


@dataclass
class SettingsControls:
    model: gr.Dropdown
    resolution: gr.Dropdown
    seed: gr.Number
    random_seed: gr.Checkbox
    steps: gr.Slider
    guidance: gr.Slider
    negative_prompt: gr.Textbox

    def as_inputs(self) -> list[gr.components.Component]:
        """Inputs in GenerationSettings field order."""
        return [
            self.model, self.resolution, self.seed, self.random_seed,
            self.steps, self.guidance, self.negative_prompt,
        ]


@dataclass
class OutputControls:
    image: gr.Image
    seed_used: gr.Textbox
    reuse_seed: gr.Button


@dataclass
class HistoryControls:
    tab: gr.Tab
    gallery: gr.Gallery
    load_more: gr.Button
    clear_all: gr.Button
    preview: gr.Image
    info: gr.Textbox
    prompt: gr.Textbox
    delete: gr.Button
    shown_ids: gr.State
    selected_id: gr.State

    def preview_outputs(self) -> list[gr.components.Component]:
        return [self.preview, self.prompt, self.info, self.selected_id]


def build_chat_tab() -> ChatControls:
    with gr.Tab("Chat Mode", id="chat_tab", visible=grok_client.available):
        chatbot = gr.Chatbot(
            label="Chat (double-click user message to edit)",
            height=300,
            editable="user",
            layout="panel",
        )
        message = gr.Textbox(placeholder="Describe the image you want...", lines=2, show_label=False)
        with gr.Row():
            send = gr.Button("Send", variant="primary")
            clear = gr.Button("Clear Chat")
    return ChatControls(chatbot, message, send, clear)


def build_direct_tab() -> tuple[gr.Textbox, gr.Button]:
    with gr.Tab("Direct Input Prompt", id="direct_tab"):
        prompt = gr.Textbox(label="Prompt", placeholder="Enter complete image generation prompt...", lines=10)
        generate = gr.Button("Generate Image", variant="primary")
    return prompt, generate


def build_examples(chat: ChatControls, direct_prompt: gr.Textbox) -> None:
    gr.Examples(
        examples=[[prompt] for prompt in EXAMPLE_PROMPTS],
        example_labels=[textwrap.shorten(" ".join(prompt.split()), 90) for prompt in EXAMPLE_PROMPTS],
        inputs=[direct_prompt],
        outputs=[chat.message, direct_prompt],
        fn=lambda prompt: (prompt, prompt),
        run_on_click=True,
        cache_examples=False,
        label="Examples (click to fill the prompt)",
    )


def build_settings(model: gr.Dropdown) -> SettingsControls:
    spec = DEFAULT_MODEL
    resolution = gr.Dropdown(label="Resolution", choices=resolutions_for(spec), value=spec.default_resolution)
    with gr.Row():
        seed = gr.Number(label="Seed", value=0, minimum=0, maximum=MAX_SEED, precision=0)
        random_seed = gr.Checkbox(label="Random Seed", value=True)
    steps = gr.Slider(minimum=1, maximum=spec.max_steps, value=spec.default_steps, step=1, label="Steps")
    guidance = gr.Slider(
        minimum=0, maximum=20, value=spec.default_guidance, step=0.1,
        label="Guidance (CFG)", visible=spec.uses_guidance,
    )
    negative_prompt = gr.Textbox(
        label="Negative Prompt", value=spec.default_negative_prompt, lines=2, visible=spec.uses_guidance,
    )
    return SettingsControls(model, resolution, seed, random_seed, steps, guidance, negative_prompt)


def build_output() -> OutputControls:
    image = gr.Image(label="Generated Image", type="pil", format="png")
    with gr.Row():
        seed_used = gr.Textbox(label="Seed Used", interactive=False, scale=3)
        reuse = gr.Button("Reuse Seed", scale=1)
    return OutputControls(image, seed_used, reuse)


def build_history_tab() -> HistoryControls:
    with gr.Tab("History") as tab:
        with gr.Row():
            clear_all = gr.Button("Clear All History", variant="stop", size="sm")
        with gr.Row():
            with gr.Column(scale=1):
                gallery = gr.Gallery(
                    label="History", columns=3, height=400, preview=False,
                    allow_preview=False, elem_classes="history-gallery",
                )
                load_more = gr.Button("Load More", size="sm")
            with gr.Column(scale=1):
                preview = gr.Image(label="Preview", type="pil", format="png")
                info = gr.Textbox(label="Info", interactive=False)
                prompt = gr.Textbox(label="Prompt", lines=5, interactive=False)
                delete = gr.Button("Delete This Image", variant="secondary")
    return HistoryControls(
        tab, gallery, load_more, clear_all, preview, info, prompt, delete,
        shown_ids=gr.State([]), selected_id=gr.State(None),
    )


def wire_chat(chat: ChatControls, settings: SettingsControls, output: OutputControls) -> None:
    inputs = settings.as_inputs()
    for trigger in (chat.send.click, chat.message.submit):
        trigger(
            chat_and_generate,
            inputs=[chat.message, chat.chatbot, *inputs],
            outputs=[chat.chatbot, output.image, output.seed_used, chat.message],
        )
    chat.clear.click(clear_chat, outputs=[chat.chatbot, output.image, output.seed_used])
    chat.chatbot.edit(truncate_at_edit, inputs=[chat.chatbot], outputs=[chat.chatbot]).then(
        regenerate_after_edit,
        inputs=[chat.chatbot, *inputs],
        outputs=[chat.chatbot, output.image, output.seed_used],
    )


def wire_generate(
    direct_prompt: gr.Textbox, generate: gr.Button, settings: SettingsControls, output: OutputControls
) -> None:
    for trigger in (generate.click, direct_prompt.submit):
        trigger(direct_generate, inputs=[direct_prompt, *settings.as_inputs()], outputs=[output.image, output.seed_used])
    output.reuse_seed.click(reuse_seed, inputs=[output.seed_used], outputs=[settings.seed, settings.random_seed])
    settings.model.change(
        on_model_change,
        inputs=[settings.model],
        outputs=[settings.resolution, settings.steps, settings.guidance, settings.negative_prompt],
    )


def wire_history(history: HistoryControls) -> None:
    page_outputs = [history.gallery, history.shown_ids]
    all_outputs = [*page_outputs, *history.preview_outputs()]
    history.tab.select(show_history, outputs=page_outputs)
    history.load_more.click(load_more_history, inputs=[history.shown_ids], outputs=page_outputs)
    history.gallery.select(on_history_select, inputs=[history.shown_ids], outputs=history.preview_outputs())
    history.delete.click(delete_selected, inputs=[history.selected_id, history.shown_ids], outputs=all_outputs)
    history.clear_all.click(clear_history, outputs=all_outputs)


def build_generate_tab() -> None:
    with gr.Tab("Generate"):
        with gr.Row():
            with gr.Column(scale=1):
                model = gr.Dropdown(
                    label="Model",
                    choices=[(spec.label, spec.id) for spec in MODELS.values()],
                    value=DEFAULT_MODEL.id,
                )
                with gr.Tabs(selected="chat_tab" if grok_client.available else "direct_tab"):
                    chat = build_chat_tab()
                    direct_prompt, generate = build_direct_tab()
                settings = build_settings(model)
                build_examples(chat, direct_prompt)
            with gr.Column(scale=1):
                output = build_output()
    wire_chat(chat, settings, output)
    wire_generate(direct_prompt, generate, settings, output)


def build_app() -> gr.Blocks:
    with gr.Blocks(title="Z-Image-Turbo") as demo:
        gr.Markdown("# Z-Image-Turbo")
        gr.Markdown("*An Efficient Image Generation Foundation Model with Single-Stream Diffusion Transformer*")
        with gr.Tabs():
            build_generate_tab()
            wire_history(build_history_tab())
    return demo


demo = build_app()

if __name__ == "__main__":
    history_store.init_db()
    demo.launch(css=CSS)
