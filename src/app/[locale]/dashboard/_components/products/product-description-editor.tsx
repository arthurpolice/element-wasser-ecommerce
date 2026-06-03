"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, type MouseEvent } from "react";
import { MdFormatListBulleted, MdFormatListNumbered } from "react-icons/md";

import type { ProductDescriptionJson } from "~/lib/form-schemas";

type ProductDescriptionEditorProps = {
  label: string;
  placeholder: string;
  value: ProductDescriptionJson | null;
  onChange: (value: ProductDescriptionJson | null) => void;
};

const emptyDocument: ProductDescriptionJson = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const toolbarButtonClass =
  "product-description-toolbar-button inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dash-accent/30 disabled:pointer-events-none disabled:opacity-50";

const descriptiveToolbarButtonClass = `${toolbarButtonClass} gap-1.5`;

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  heading2: boolean;
  heading3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  link: boolean;
};

const inactiveToolbarState: ToolbarState = {
  bold: false,
  italic: false,
  heading2: false,
  heading3: false,
  bulletList: false,
  orderedList: false,
  link: false,
};

function normalizeProductDescription(editor: Editor) {
  if (editor.isEmpty || editor.getText().trim().length === 0) {
    return null;
  }

  return editor.getJSON();
}

function isSameProductDescription(
  left: ProductDescriptionJson | null,
  right: ProductDescriptionJson | null,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getToolbarState(editor: Editor | null): ToolbarState {
  if (!editor) {
    return inactiveToolbarState;
  }

  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    heading2: editor.isActive("heading", { level: 2 }),
    heading3: editor.isActive("heading", { level: 3 }),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    link: editor.isActive("link"),
  };
}

function useToolbarState(editor: Editor | null) {
  const [toolbarState, setToolbarState] = useState<ToolbarState>(() =>
    getToolbarState(editor),
  );

  useEffect(() => {
    if (!editor) {
      setToolbarState(inactiveToolbarState);
      return;
    }

    function syncToolbarState() {
      setToolbarState(getToolbarState(editor));
    }

    syncToolbarState();
    editor.on("transaction", syncToolbarState);
    editor.on("selectionUpdate", syncToolbarState);
    editor.on("focus", syncToolbarState);
    editor.on("blur", syncToolbarState);

    return () => {
      editor.off("transaction", syncToolbarState);
      editor.off("selectionUpdate", syncToolbarState);
      editor.off("focus", syncToolbarState);
      editor.off("blur", syncToolbarState);
    };
  }, [editor]);

  return toolbarState;
}

function preserveEditorSelection(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function ProductDescriptionToolbar({ editor }: { editor: Editor | null }) {
  const activeStates = useToolbarState(editor);

  function setLink() {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "");

    if (url === null) {
      return;
    }

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }

  return (
    <div className="border-dash-border flex flex-wrap gap-1 border-b bg-[#f6f9fc] p-2">
      <button
        aria-pressed={activeStates.bold}
        className={toolbarButtonClass}
        data-active={activeStates.bold ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        type="button"
      >
        B
      </button>
      <button
        aria-pressed={activeStates.italic}
        className={toolbarButtonClass}
        data-active={activeStates.italic ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        type="button"
      >
        I
      </button>
      <button
        aria-pressed={activeStates.heading2}
        aria-label="Heading"
        className={descriptiveToolbarButtonClass}
        data-active={activeStates.heading2 ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run()
        }
        title="Heading"
        type="button"
      >
        <span className="text-sm leading-none">T</span>
        <span>Heading</span>
      </button>
      <button
        aria-pressed={activeStates.heading3}
        aria-label="Subheading"
        className={descriptiveToolbarButtonClass}
        data-active={activeStates.heading3 ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 3 }).run()
        }
        title="Subheading"
        type="button"
      >
        <span className="text-xs leading-none">T</span>
        <span>Subheading</span>
      </button>
      <button
        aria-pressed={activeStates.bulletList}
        aria-label="Bulleted list"
        className={toolbarButtonClass}
        data-active={activeStates.bulletList ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        title="Bulleted list"
        type="button"
      >
        <MdFormatListBulleted aria-hidden="true" size={22} />
      </button>
      <button
        aria-pressed={activeStates.orderedList}
        aria-label="Numbered list"
        className={toolbarButtonClass}
        data-active={activeStates.orderedList ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
        type="button"
      >
        <MdFormatListNumbered aria-hidden="true" size={22} />
      </button>
      <button
        aria-pressed={activeStates.link}
        className={toolbarButtonClass}
        data-active={activeStates.link ? "true" : "false"}
        disabled={!editor}
        onMouseDown={preserveEditorSelection}
        onClick={setLink}
        type="button"
      >
        Link
      </button>
    </div>
  );
}

export function ProductDescriptionEditor({
  label,
  placeholder,
  value,
  onChange,
}: ProductDescriptionEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false,
      }),
    ],
    content: value ?? emptyDocument,
    editorProps: {
      attributes: {
        class:
          "min-h-36 px-3 py-2.5 text-sm leading-6 text-dash-ink outline-none prose-product-description",
      },
    },
    onUpdate({ editor: updatedEditor }) {
      onChange(normalizeProductDescription(updatedEditor));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (value === null) {
      if (!editor.isEmpty) {
        editor.commands.setContent(emptyDocument, { emitUpdate: false });
      }
      return;
    }

    if (!isSameProductDescription(editor.getJSON(), value)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="grid gap-1 text-sm">
      <span>{label}</span>
      <div className="border-dash-border bg-dash-surface focus-within:border-dash-accent focus-within:ring-dash-accent/20 overflow-hidden rounded-lg border shadow-sm transition focus-within:ring-2">
        <ProductDescriptionToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
      <p className="text-dash-muted text-xs">{placeholder}</p>
    </div>
  );
}
