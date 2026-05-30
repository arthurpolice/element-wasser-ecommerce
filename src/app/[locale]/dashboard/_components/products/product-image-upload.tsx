"use client";

import Image from "next/image";
import { useCallback, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  isProductImageContentType,
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_MAX_BYTES,
} from "~/lib/product-images";

export { MAX_PRODUCT_IMAGES };

export type ProductImageDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

export type ProductImageSlots = Array<ProductImageDraft | null>;

export function createEmptyProductImageSlots(): ProductImageSlots {
  return Array.from({ length: MAX_PRODUCT_IMAGES }, () => null);
}

export function countFilledProductImageSlots(slots: ProductImageSlots) {
  return slots.filter((slot) => slot != null).length;
}

type ProductImageUploadProps = {
  slots: ProductImageSlots;
  onChange: (slots: ProductImageSlots) => void;
};

const slotClass =
  "relative aspect-square overflow-hidden rounded-lg border border-dash-border bg-[#f6f9fc]";

function createDraft(file: File): ProductImageDraft {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function isImageFile(file: File) {
  return isProductImageContentType(file.type);
}

function isValidImageSize(file: File) {
  return file.size > 0 && file.size <= PRODUCT_IMAGE_MAX_BYTES;
}

export function ProductImageUpload({ slots, onChange }: ProductImageUploadProps) {
  const t = useTranslations("Products.create.images");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<ProductImageDraft | null>(null);

  const filledCount = countFilledProductImageSlots(slots);
  const canAddMore = filledCount < MAX_PRODUCT_IMAGES;

  const addFiles = useCallback(
    (files: FileList | File[], startAt?: number) => {
      if (!canAddMore) {
        return;
      }

      const nextSlots = [...slots];
      let slotIndex =
        startAt ??
        nextSlots.findIndex((slot) => slot == null);

      for (const file of Array.from(files)) {
        if (slotIndex === -1) {
          break;
        }

        if (!isImageFile(file) || !isValidImageSize(file)) {
          continue;
        }

        if (nextSlots[slotIndex]) {
          slotIndex = nextSlots.findIndex(
            (slot, index) => index > slotIndex && slot == null,
          );
          if (slotIndex === -1) {
            break;
          }
        }

        nextSlots[slotIndex] = createDraft(file);
        slotIndex = nextSlots.findIndex(
          (slot, index) => index > slotIndex && slot == null,
        );
      }

      if (nextSlots.some((slot, index) => slot !== slots[index])) {
        onChange(nextSlots);
      }
    },
    [canAddMore, onChange, slots],
  );

  function removeImage(slotIndex: number) {
    const removed = slots[slotIndex];
    if (!removed) {
      return;
    }

    URL.revokeObjectURL(removed.previewUrl);

    const nextSlots = [...slots];
    nextSlots[slotIndex] = null;
    onChange(nextSlots);
  }

  function openFilePicker(slotIndex?: number) {
    setActiveSlotIndex(slotIndex ?? null);
    inputRef.current?.click();
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (canAddMore) {
      setIsDragging(true);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }

    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }

  return (
    <section className="grid gap-3">
      <div>
        <h3 className="text-sm font-medium text-dash-ink">{t("title")}</h3>
        <p className="mt-0.5 text-xs text-dash-muted">{t("description")}</p>
      </div>

      {canAddMore ? (
        <div
          className={`rounded-xl border border-dashed px-4 py-6 text-center transition ${
            isDragging
              ? "border-dash-accent bg-dash-accent/5"
              : "border-dash-border bg-[#f6f9fc]/60 hover:border-dash-accent/40"
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            id={inputId}
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(
                  event.target.files,
                  activeSlotIndex ?? undefined,
                );
              }

              setActiveSlotIndex(null);
              event.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
          <label
            className="flex cursor-pointer flex-col items-center gap-2 text-sm"
            htmlFor={inputId}
          >
            <span className="font-medium text-dash-ink">{t("dropzoneTitle")}</span>
            <span className="text-xs text-dash-muted">{t("dropzoneHint")}</span>
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: MAX_PRODUCT_IMAGES }, (_, index) => {
          const image = slots[index];

          if (image) {
            return (
              <div className={slotClass} key={`slot-${index}`}>
                <button
                  aria-label={t("previewImage", { index: index + 1 })}
                  className="absolute inset-0"
                  onClick={() => setPreviewImage(image)}
                  type="button"
                >
                  <Image
                    alt={t("previewImage", { index: index + 1 })}
                    className="object-cover"
                    fill
                    sizes="80px"
                    src={image.previewUrl}
                    unoptimized
                  />
                </button>
                <button
                  aria-label={t("removeImage", { index: index + 1 })}
                  className="absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-dash-sidebar/90 text-xs leading-none text-white shadow-sm transition hover:bg-dash-sidebar"
                  onClick={() => removeImage(index)}
                  type="button"
                >
                  ×
                </button>
              </div>
            );
          }

          return (
            <button
              aria-label={t("addImageSlot", { index: index + 1 })}
              className={`${slotClass} flex items-center justify-center border-dashed text-dash-muted transition hover:border-dash-accent/40 hover:text-dash-accent disabled:pointer-events-none disabled:opacity-50`}
              disabled={!canAddMore}
              key={`empty-${index}`}
              onClick={() => openFilePicker(index)}
              type="button"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                +
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-dash-muted">
        {t("count", { count: filledCount, max: MAX_PRODUCT_IMAGES })}
      </p>

      {previewImage ? (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-dash-sidebar/60 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-dash-border bg-dash-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-center justify-between gap-4 border-b border-dash-border px-4 py-3">
              <p className="text-sm font-medium text-dash-ink">{t("previewTitle")}</p>
              <button
                aria-label={t("closePreview")}
                className="rounded-lg px-2 py-1 text-dash-muted transition hover:bg-[#f6f9fc] hover:text-dash-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dash-accent/30"
                onClick={() => setPreviewImage(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="relative max-h-[min(70vh,640px)]">
              <Image
                alt={t("previewTitle")}
                className="h-auto max-h-[min(70vh,640px)] w-full object-contain"
                height={640}
                src={previewImage.previewUrl}
                unoptimized
                width={640}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function revokeProductImageDrafts(slots: ProductImageSlots) {
  for (const image of slots) {
    if (image) {
      URL.revokeObjectURL(image.previewUrl);
    }
  }
}
