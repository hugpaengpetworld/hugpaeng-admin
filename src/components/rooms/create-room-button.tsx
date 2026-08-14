"use client";

import { useFormStatus } from "react-dom";

export function CreateRoomButton({
  species,
}: {
  readonly species: "CAT" | "DOG";
}) {
  const { pending } = useFormStatus();
  const animalLabel = species === "CAT" ? "แมว" : "สุนัข";

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(`ยืนยันเพิ่มห้องพัก${animalLabel}หมายเลขถัดไปในระบบ?`)
        ) {
          event.preventDefault();
        }
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2d7a5d] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#123c2f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123c2f] disabled:cursor-wait disabled:opacity-60"
    >
      <span aria-hidden="true" className="text-xl leading-none">
        +
      </span>
      {pending ? "กำลังเพิ่มห้อง..." : `เพิ่มห้องพัก${animalLabel}`}
    </button>
  );
}
