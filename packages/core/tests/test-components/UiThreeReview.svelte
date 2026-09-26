<script lang="ts">
import DataTableHeader from '../../src/lib/components/data-table/DataTableHeader.svelte';
import CommandGroup from '../../src/lib/components/command/CommandGroup.svelte';
import Textarea from '../../src/lib/components/ui/textarea/Textarea.svelte';
import type { Store } from '../../src/lib/types.js';
import type { TableState, TableAction } from '../../src/lib/components/data-table/table.types.js';
type Row={name:string; age:number; id:number};
let {store, label='Shared heading with spaces', resize='vertical'}:{store:Store<TableState<Row>,TableAction<Row>>;label?:string;resize?:'none'|'vertical'|'horizontal'|'both'}=$props();
const columns=[{key:'name' as const,label:'Name'},{key:'age' as const,label:'Age'},{key:'id' as const,label:'Identifier',sortable:false}];
</script>
<table><thead><DataTableHeader {store} {columns}/></thead></table>
<CommandGroup {label}>First group</CommandGroup>
<CommandGroup {label}>Second group</CommandGroup>
<Textarea {resize} aria-label="Notes"/>
