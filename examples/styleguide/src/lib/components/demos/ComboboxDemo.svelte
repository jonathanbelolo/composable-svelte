<script lang="ts">
  import { Combobox } from '@composable-svelte/core/components/ui/combobox/index.js';
  import type { ComboboxOption } from '@composable-svelte/core/components/ui/combobox/combobox.types.js';
  import { Card, CardContent, CardHeader, CardTitle } from '@composable-svelte/core/components/ui/card/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  // Fruit options
  const fruitOptions: ComboboxOption[] = [
    { value: 'apple', label: 'Apple', description: 'A red or green fruit' },
    { value: 'banana', label: 'Banana', description: 'A yellow tropical fruit' },
    { value: 'cherry', label: 'Cherry', description: 'A small red stone fruit' },
    { value: 'grape', label: 'Grape', description: 'Small round berries' },
    { value: 'kiwi', label: 'Kiwi', description: 'A fuzzy brown fruit' },
    { value: 'mango', label: 'Mango', description: 'A sweet tropical fruit' },
    { value: 'orange', label: 'Orange', description: 'A citrus fruit' },
    { value: 'peach', label: 'Peach', description: 'A soft stone fruit' },
    { value: 'pear', label: 'Pear', description: 'A sweet green or yellow fruit' },
    { value: 'strawberry', label: 'Strawberry', description: 'A red berry' },
  ];

  // Country options with flags
  const countryOptions: ComboboxOption[] = [
    { value: 'us', label: 'United States' },
    { value: 'ca', label: 'Canada' },
    { value: 'mx', label: 'Mexico' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'fr', label: 'France' },
    { value: 'de', label: 'Germany' },
    { value: 'jp', label: 'Japan' },
    { value: 'cn', label: 'China' },
    { value: 'in', label: 'India' },
    { value: 'au', label: 'Australia' },
  ];

  // Programming language options
  const languageOptions: ComboboxOption[] = [
    { value: 'js', label: 'JavaScript', description: 'Dynamic web programming' },
    { value: 'ts', label: 'TypeScript', description: 'Typed JavaScript superset' },
    { value: 'py', label: 'Python', description: 'General-purpose language' },
    { value: 'java', label: 'Java', description: 'Object-oriented language' },
    { value: 'go', label: 'Go', description: 'Google systems language' },
    { value: 'rust', label: 'Rust', description: 'Memory-safe systems language' },
    { value: 'swift', label: 'Swift', description: 'Apple platform language' },
    { value: 'kotlin', label: 'Kotlin', description: 'Modern JVM language' },
    { value: 'ruby', label: 'Ruby', description: 'Dynamic scripting language' },
    { value: 'php', label: 'PHP', description: 'Web server scripting' },
  ];

  // Framework options
  const frameworkOptions: ComboboxOption[] = [
    { value: 'svelte', label: 'Svelte', description: 'Compile-time framework' },
    { value: 'react', label: 'React', description: 'UI component library' },
    { value: 'vue', label: 'Vue', description: 'Progressive framework' },
    { value: 'angular', label: 'Angular', description: 'Full-featured framework' },
    { value: 'solid', label: 'Solid', description: 'Fine-grained reactive' },
  ];

  // Mock user database for async search
  const mockUsers = [
    { id: '1', name: 'Sarah Johnson', role: 'CEO', email: 'sarah@example.com' },
    { id: '2', name: 'Michael Chen', role: 'CTO', email: 'michael@example.com' },
    { id: '3', name: 'Emily Rodriguez', role: 'Designer', email: 'emily@example.com' },
    { id: '4', name: 'Alex Kim', role: 'Developer', email: 'alex@example.com' },
    { id: '5', name: 'Jordan Lee', role: 'Developer', email: 'jordan@example.com' },
    { id: '6', name: 'Chris Taylor', role: 'DevOps', email: 'chris@example.com' },
    { id: '7', name: 'David Brown', role: 'Marketing', email: 'david@example.com' },
    { id: '8', name: 'Lisa Wang', role: 'Sales', email: 'lisa@example.com' },
    { id: '9', name: 'Tom Anderson', role: 'Support', email: 'tom@example.com' },
    { id: '10', name: 'Anna Martinez', role: 'HR', email: 'anna@example.com' },
  ];

  // Mock city database
  const mockCities = [
    { id: '1', name: 'New York', country: 'USA', population: '8.3M' },
    { id: '2', name: 'Los Angeles', country: 'USA', population: '4M' },
    { id: '3', name: 'London', country: 'UK', population: '9M' },
    { id: '4', name: 'Paris', country: 'France', population: '2.2M' },
    { id: '5', name: 'Tokyo', country: 'Japan', population: '14M' },
    { id: '6', name: 'Shanghai', country: 'China', population: '24M' },
    { id: '7', name: 'Mumbai', country: 'India', population: '20M' },
    { id: '8', name: 'São Paulo', country: 'Brazil', population: '12M' },
    { id: '9', name: 'Toronto', country: 'Canada', population: '2.9M' },
    { id: '10', name: 'Sydney', country: 'Australia', population: '5M' },
  ];

  // Async search function for users
  async function searchUsers(query: string): Promise<ComboboxOption[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!query) {
      return mockUsers.slice(0, 5).map((user) => ({
        value: user.id,
        label: user.name,
        description: `${user.role} • ${user.email}`,
      }));
    }

    const lowerQuery = query.toLowerCase();
    const filtered = mockUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(lowerQuery) ||
        user.role.toLowerCase().includes(lowerQuery) ||
        user.email.toLowerCase().includes(lowerQuery)
    );

    return filtered.map((user) => ({
      value: user.id,
      label: user.name,
      description: `${user.role} • ${user.email}`,
    }));
  }

  // Async search function for cities
  async function searchCities(query: string): Promise<ComboboxOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!query) {
      return mockCities.slice(0, 5).map((city) => ({
        value: city.id,
        label: city.name,
        description: `${city.country} • ${city.population}`,
      }));
    }

    const lowerQuery = query.toLowerCase();
    const filtered = mockCities.filter(
      (city) =>
        city.name.toLowerCase().includes(lowerQuery) ||
        city.country.toLowerCase().includes(lowerQuery)
    );

    return filtered.map((city) => ({
      value: city.id,
      label: city.name,
      description: `${city.country} • ${city.population}`,
    }));
  }

  let selectedFruit = $state<string | null>(null);
  let selectedCountry = $state<string | null>(null);
  let selectedLanguage = $state<string | null>(null);
  let selectedFramework = $state<string | null>('svelte');
  let selectedUser = $state<string | null>(null);
  let selectedCity = $state<string | null>(null);

  function handleFruitChange(value: string | null) {
    selectedFruit = value;
  }
</script>

<div class="space-y-12">
  <!-- Basic Combobox -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Combobox</h3>
      <p class="text-muted-foreground text-sm">
        Searchable select with local filtering
      </p>
      {#if selectedFruit}
        <div class="mt-2">
          <Badge variant="primary">Selected: {selectedFruit}</Badge>
        </div>
      {/if}
    </div>

    <Card>
      <CardContent class="p-6">
        <div class="max-w-md">
          <label class="text-sm font-medium mb-2 block">Choose a fruit</label>
          <Combobox
            options={fruitOptions}
            bind:value={selectedFruit}
            placeholder="Search fruits..."
            onchange={handleFruitChange}
          />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Multiple Comboboxes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Multiple Comboboxes</h3>
      <p class="text-muted-foreground text-sm">
        Different select dropdowns in a form
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Developer Profile</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div>
          <label class="text-sm font-medium mb-2 block">Country</label>
          <Combobox
            options={countryOptions}
            bind:value={selectedCountry}
            placeholder="Select country..."
          />
        </div>

        <div>
          <label class="text-sm font-medium mb-2 block">Favorite Language</label>
          <Combobox
            options={languageOptions}
            bind:value={selectedLanguage}
            placeholder="Select language..."
          />
        </div>

        <div>
          <label class="text-sm font-medium mb-2 block">Preferred Framework</label>
          <Combobox
            options={frameworkOptions}
            bind:value={selectedFramework}
            placeholder="Select framework..."
          />
        </div>

        {#if selectedCountry || selectedLanguage || selectedFramework}
          <div class="pt-4 border-t space-y-2">
            <p class="text-sm font-medium">Selected Values:</p>
            <div class="flex flex-wrap gap-2">
              {#if selectedCountry}
                <Badge variant="secondary">Country: {selectedCountry}</Badge>
              {/if}
              {#if selectedLanguage}
                <Badge variant="secondary">Language: {selectedLanguage}</Badge>
              {/if}
              {#if selectedFramework}
                <Badge variant="secondary">Framework: {selectedFramework}</Badge>
              {/if}
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  </section>

  <!-- Async Search - Users -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Async Search</h3>
      <p class="text-muted-foreground text-sm">
        Load options dynamically from async source
      </p>
      {#if selectedUser}
        <div class="mt-2">
          <Badge variant="success">User ID: {selectedUser}</Badge>
        </div>
      {/if}
    </div>

    <Card>
      <CardHeader>
        <CardTitle>User Search</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="max-w-md">
          <Combobox
            bind:value={selectedUser}
            loadOptions={searchUsers}
            placeholder="Search users by name, role, or email..."
            debounceDelay={300}
          />
          <p class="text-xs text-muted-foreground mt-2">
            Try searching for: Sarah, Developer, or @example.com
          </p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Async Search - Cities -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Async with Fast Debounce</h3>
      <p class="text-muted-foreground text-sm">
        Faster response time with reduced debounce delay
      </p>
      {#if selectedCity}
        <div class="mt-2">
          <Badge variant="primary">City ID: {selectedCity}</Badge>
        </div>
      {/if}
    </div>

    <Card>
      <CardHeader>
        <CardTitle>City Search</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="max-w-md">
          <Combobox
            bind:value={selectedCity}
            loadOptions={searchCities}
            placeholder="Search cities..."
            debounceDelay={150}
          />
          <p class="text-xs text-muted-foreground mt-2">
            Try searching: New York, London, Tokyo, etc.
          </p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Disabled State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled State</h3>
      <p class="text-muted-foreground text-sm">
        Combobox in disabled state
      </p>
    </div>

    <Card>
      <CardContent class="p-6">
        <div class="max-w-md">
          <label class="text-sm font-medium mb-2 block">Disabled Combobox</label>
          <Combobox
            options={fruitOptions}
            placeholder="This combobox is disabled"
            disabled={true}
          />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Keyboard Navigation -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Keyboard Navigation</h3>
      <p class="text-muted-foreground text-sm">
        Full keyboard accessibility support
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Try Keyboard Controls</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="max-w-md mb-6">
          <Combobox
            options={languageOptions}
            placeholder="Focus and use keyboard..."
          />
        </div>

        <div class="space-y-2 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">↑</kbd>
              <span class="text-muted-foreground">Previous option</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">↓</kbd>
              <span class="text-muted-foreground">Next option</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">Enter</kbd>
              <span class="text-muted-foreground">Select option</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">Esc</kbd>
              <span class="text-muted-foreground">Close dropdown</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">Home</kbd>
              <span class="text-muted-foreground">First option</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">End</kbd>
              <span class="text-muted-foreground">Last option</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>
</div>
