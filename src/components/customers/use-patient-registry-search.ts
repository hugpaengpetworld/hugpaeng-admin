"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  searchPatientRegistryAction,
  type RegistrySearchState,
} from "@/app/admin/customers/actions";

const EMPTY_STATE: RegistrySearchState = {
  status: "idle",
  query: "",
  results: [],
};

export function usePatientRegistrySearch() {
  const [state, searchAction, pending] = useActionState(
    searchPatientRegistryAction,
    EMPTY_STATE,
  );
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const lastSubmittedQuery = useRef("");
  const cleanQuery = query.trim();

  useEffect(() => {
    if (cleanQuery.length < 2) {
      lastSubmittedQuery.current = "";
      return;
    }
    const timeout = window.setTimeout(() => {
      if (lastSubmittedQuery.current === cleanQuery) return;
      lastSubmittedQuery.current = cleanQuery;
      formRef.current?.requestSubmit();
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [cleanQuery]);

  const visibleState =
    state.query === cleanQuery && cleanQuery.length >= 2 ? state : EMPTY_STATE;

  return {
    cleanQuery,
    formRef,
    pending,
    query,
    searchAction,
    setQuery,
    visibleState,
    markSubmitted: () => {
      lastSubmittedQuery.current = cleanQuery;
    },
  } as const;
}
