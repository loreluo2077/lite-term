import { useMemo } from "react";
import { setWidgetTitle, useWidgetContext, useWidgetState } from "./widget-api";
import "./styles.css";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

type TodoFilter = "all" | "active" | "done";

type TodoWidgetState = {
  todos: TodoItem[];
  filter: TodoFilter;
  draft: string;
};

const DEFAULT_STATE: TodoWidgetState = {
  todos: [],
  filter: "all",
  draft: ""
};

function createTodoId() {
  return globalThis.crypto?.randomUUID?.() ?? `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function App() {
  const context = useWidgetContext();
  const { state, patchState } = useWidgetState(DEFAULT_STATE);
  const baseButtonClass =
    "h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40";

  const visibleTodos = useMemo(() => {
    if (state.filter === "active") return state.todos.filter((item) => !item.done);
    if (state.filter === "done") return state.todos.filter((item) => item.done);
    return state.todos;
  }, [state.filter, state.todos]);

  const doneCount = useMemo(
    () => state.todos.filter((item) => item.done).length,
    [state.todos]
  );

  const activeCount = state.todos.length - doneCount;

  const syncTitle = async (todos: TodoItem[]) => {
    const done = todos.filter((item) => item.done).length;
    await setWidgetTitle(`Todo (${done}/${todos.length})`).catch(() => undefined);
  };

  const addTodo = async () => {
    const text = state.draft.trim();
    if (!text) return;
    const nextTodos = [
      {
        id: createTodoId(),
        text,
        done: false,
        createdAt: Date.now()
      },
      ...state.todos
    ];
    await patchState({
      todos: nextTodos,
      draft: ""
    });
    await syncTitle(nextTodos);
  };

  const toggleTodo = async (id: string) => {
    const nextTodos = state.todos.map((item) =>
      item.id === id
        ? {
            ...item,
            done: !item.done
          }
        : item
    );
    await patchState({ todos: nextTodos });
    await syncTitle(nextTodos);
  };

  const removeTodo = async (id: string) => {
    const nextTodos = state.todos.filter((item) => item.id !== id);
    await patchState({ todos: nextTodos });
    await syncTitle(nextTodos);
  };

  const clearDone = async () => {
    const nextTodos = state.todos.filter((item) => !item.done);
    await patchState({ todos: nextTodos });
    await syncTitle(nextTodos);
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_auto_1fr] gap-2.5 bg-[radial-gradient(circle_at_top_left,rgba(31,41,55,1),rgba(9,9,11,1)_58%)] p-3 text-zinc-100">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="m-0 text-[15px] font-semibold tracking-wide">Todo List</h1>
          <p className="mt-1 text-[11px] text-zinc-400">
            {context ? `Workspace: ${context.workspaceName}` : "Loading widget context..."}
          </p>
        </div>
        <div className="flex gap-2 text-[11px] text-zinc-400">
          <span>All: {state.todos.length}</span>
          <span>Active: {activeCount}</span>
          <span>Done: {doneCount}</span>
        </div>
      </header>

      <section className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={state.draft}
          onChange={(event) => {
            void patchState({ draft: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addTodo();
            }
          }}
          placeholder="Add a task"
          className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-500"
        />
        <button type="button" className={baseButtonClass} onClick={() => void addTodo()}>
          Add
        </button>
      </section>

      <section className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(["all", "active", "done"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`${baseButtonClass} h-8 px-2.5 text-xs ${state.filter === filter ? "border-sky-500 bg-blue-900/70" : ""}`}
              onClick={() => {
                void patchState({ filter });
              }}
            >
              {filter}
            </button>
          ))}
        </div>
        <button type="button" className={`${baseButtonClass} h-8 text-xs`} onClick={() => void clearDone()} disabled={doneCount === 0}>
          Clear Done
        </button>
      </section>

      <ul className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-auto p-0">
        {visibleTodos.length === 0 ? (
          <li className="flex items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-400">
            No tasks
          </li>
        ) : (
          visibleTodos.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2.5 rounded-lg border border-zinc-700 bg-zinc-900/75 px-3 py-2"
            >
              <label className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {
                    void toggleTodo(item.id);
                  }}
                />
                <span className={`truncate text-sm ${item.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                  {item.text}
                </span>
              </label>
              <button
                type="button"
                className="h-7 rounded-md border border-red-900 bg-red-950 px-2.5 text-xs text-red-100 hover:border-red-700"
                onClick={() => {
                  void removeTodo(item.id);
                }}
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
