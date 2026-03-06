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
    <div className="todo-root">
      <header className="todo-header">
        <div>
          <h1>Todo List</h1>
          <p>
            {context ? `Workspace: ${context.workspaceName}` : "Loading widget context..."}
          </p>
        </div>
        <div className="todo-stats">
          <span>All: {state.todos.length}</span>
          <span>Active: {activeCount}</span>
          <span>Done: {doneCount}</span>
        </div>
      </header>

      <section className="todo-input-row">
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
        />
        <button type="button" onClick={() => void addTodo()}>Add</button>
      </section>

      <section className="todo-toolbar">
        <div className="todo-filters">
          {(["all", "active", "done"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              className={state.filter === filter ? "active" : ""}
              onClick={() => {
                void patchState({ filter });
              }}
            >
              {filter}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void clearDone()} disabled={doneCount === 0}>
          Clear Done
        </button>
      </section>

      <ul className="todo-list">
        {visibleTodos.length === 0 ? (
          <li className="todo-empty">No tasks</li>
        ) : (
          visibleTodos.map((item) => (
            <li key={item.id} className={item.done ? "done" : ""}>
              <label>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => {
                    void toggleTodo(item.id);
                  }}
                />
                <span>{item.text}</span>
              </label>
              <button
                type="button"
                className="danger"
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
