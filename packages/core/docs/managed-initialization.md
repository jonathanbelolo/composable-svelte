# Managed initialization: provisional internal contract

The application assembly boundary can opt into attachment-gated initialization through the internal managed execution configuration. This is a qualified shared-runtime capability, not a frozen public `useApplication` or `defineApplication` API. Application features do not subscribe to mounts, manufacture owner tokens, or invoke activation themselves.

Initial feature state already has owner epochs before rendering. In the opt-in mode, composition calls initial `onCreate` factories once as pure planning, without calling reducers. The returned descriptions wait in the existing resource scope. Factories for children created before attachment are planned during their successful business turn and wait in the same way. Removing or replacing an owner retires its pending descriptions. Keyed reordering preserves the epoch and does not repeat initialization.

`onCreate` describes resources or effects. An optional typed child `startup` declaration returns a business action, or `undefined` when its explicit initial data already satisfies startup. The framework lifts that action through the existing composition and stamps its original owner. The root startup action is configured once at construction. Its reducer reads current business state and can decide that loading is already satisfied. Skipping a business load does not suppress unrelated resource initialization.

A successful host attachment sends a private FIFO control command. Previously accepted business turns keep their order. Root startup is queued before the remaining initial child work, so a root startup reducer that removes a child prevents that child's obsolete initialization. The control command is absent from business action history; the declared startup actions appear normally. Each submitted entitlement is attempted once. If pending-record settlement loses only its attachment before submission, the same captured work remains pending in its original traversal position for a later attachment; factories are not repeated. Startup rejection is observable and does not automatically retry on remount; business retry remains an explicit action.

Planning decisions are captured. Attachment does not rerun factories against potentially changed data. Startup reducers still see current state. Local effect IDs and cancellation groups do not exist until the description executes; cancelling an unstarted effect ID is not a persistent ban on later lifecycle initialization.

Host release only removes attachment availability. It does not destroy the borrowed store or cancel already-running business work. New owner initialization accepted while detached waits for a later live claim. An old claim cannot release a newer one. Root destruction retires all pending work and observes asynchronous cleanup through the same resource scope.

Server rendering never activates this work, even with ordinary server effects explicitly enabled. Each request still owns and destroys its store. Hydration first adopts the server markup; activation follows successful browser attachment. Client roots allocate fresh epochs from initial state and do not deserialize server runtime records.

Managed TestStore uses the same queue and resources. Its narrow internal activation harness is explicit; `finish()` reports unactivated pending resources and never activates them as a convenience. Existing standalone managed stores retain their previous initialization timing unless the internal attachment mode is selected. Legacy immediate subscriber reentrancy is unchanged.

Application/outlet facades, binding-completeness checks, routing normalization, and coordinated motion/focus remain separate implementation stages. This capability does not imply those stages are complete.
