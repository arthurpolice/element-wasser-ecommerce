"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createPostFormSchema } from "~/lib/form-schemas";
import { api } from "~/trpc/react";

export function LatestPost() {
  const [latestPost] = api.post.getLatest.useSuspenseQuery();

  const utils = api.useUtils();
  const createPost = api.post.create.useMutation({
    onSuccess: async () => {
      await utils.post.invalidate();
      reset();
    },
  });

  const { register, handleSubmit, reset } = useForm({
    resolver: zodResolver(createPostFormSchema),
    defaultValues: { name: "" },
  });

  return (
    <div className="w-full max-w-xs">
      {latestPost ? (
        <p className="truncate">Your most recent post: {latestPost.name}</p>
      ) : (
        <p>You have no posts yet.</p>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={handleSubmit((data) => createPost.mutate(data))}
      >
        <input
          className="w-full rounded-full bg-white/10 px-4 py-2 text-white"
          placeholder="Title"
          type="text"
          {...register("name")}
        />
        <button
          className="rounded-full bg-white/10 px-10 py-3 font-semibold transition hover:bg-white/20"
          disabled={createPost.isPending}
          type="submit"
        >
          {createPost.isPending ? "Submitting..." : "Submit"}
        </button>
      </form>
    </div>
  );
}
