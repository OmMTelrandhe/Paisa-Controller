import { useState, useEffect, useCallback } from 'react';
import { Transaction, TransactionType, Category } from '../types';
import { suggestCategory, addToTransactionHistory } from '../data/categories';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [aiConfidence, setAiConfidence] = useState<Record<string, number>>({});
  const { user } = useAuth();

  // Fetch transactions from Supabase
  const fetchTransactions = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        // Transform the data from Supabase format to our app's Transaction format
        const formattedTransactions: Transaction[] = data.map(item => ({
          id: item.id,
          amount: item.amount,
          description: item.description,
          category: {
            id: item.category_id,
            name: item.category_name,
            icon: item.category_icon,
            color: item.category_color
          },
          date: new Date(item.date),
          type: item.type as TransactionType,
          tags: item.tags || [],
          currency: item.currency || undefined,
          originalAmount: item.original_amount || undefined
        }));

        setTransactions(formattedTransactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    if (!user) {
      console.error('User not authenticated');
      return transaction as Transaction;
    }

    try {
      // Prepare the transaction data for Supabase
      const supabaseTransaction = {
        user_id: user.id,
        amount: transaction.amount,
        description: transaction.description,
        category_id: transaction.category.id,
        category_name: transaction.category.name,
        category_icon: transaction.category.icon,
        category_color: transaction.category.color,
        date: transaction.date.toISOString(),
        type: transaction.type,
        tags: transaction.tags || [],
        currency: transaction.currency || null,
        original_amount: transaction.originalAmount || null
      };

      const { data, error } = await supabase
        .from('transactions')
        .insert(supabaseTransaction)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Add to transaction history for AI learning
      addToTransactionHistory(transaction.description, transaction.category.id);

      // Create the new transaction with the ID from Supabase
      const newTransaction: Transaction = {
        ...transaction,
        id: data.id
      };

      // Update the local state
      setTransactions(prev => [newTransaction, ...prev]);
      return newTransaction;
    } catch (error) {
      console.error('Error adding transaction:', error);
      // Return a transaction with a temporary ID for UI purposes
      return {
        ...transaction,
        id: Math.random().toString(36).substring(2, 9)
      } as Transaction;
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!user) {
      console.error('User not authenticated');
      return;
    }

    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      // Update the local state
      setTransactions(prev => prev.filter(transaction => transaction.id !== id));
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const getFilteredTransactions = (
    type?: TransactionType,
    categoryId?: string,
    searchTerm?: string,
    startDate?: Date,
    endDate?: Date
  ) => {
    return transactions.filter(transaction => {
      // Filter by type
      if (type && transaction.type !== type) return false;
      
      // Filter by category
      if (categoryId && transaction.category.id !== categoryId) return false;
      
      // Filter by search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesDescription = transaction.description.toLowerCase().includes(term);
        const matchesTags = transaction.tags?.some(tag => tag.toLowerCase().includes(term));
        if (!matchesDescription && !matchesTags) return false;
      }
      
      // Filter by date range
      if (startDate && transaction.date < startDate) return false;
      if (endDate && transaction.date > endDate) return false;
      
      return true;
    });
  };

  const predictCategory = (description: string): Category | undefined => {
    // Use the enhanced AI categorization
    const predictedCategory = suggestCategory(description);
    
    // In a real app, we would get confidence scores from the AI model
    // Here we're simulating confidence scores
    if (predictedCategory) {
      const confidence = Math.random() * 0.3 + 0.7; // Random confidence between 70% and 100%
      setAiConfidence(prev => ({
        ...prev,
        [description]: confidence
      }));
    }
    
    return predictedCategory;
  };

  const getCategoryPredictionConfidence = (description: string): number => {
    return aiConfidence[description] || 0;
  };

  return {
    transactions,
    isLoading,
    addTransaction,
    deleteTransaction,
    getFilteredTransactions,
    predictCategory,
    getCategoryPredictionConfidence
  };
}